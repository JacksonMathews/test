import _ from 'lodash'
import { createEditor, Editor, Node as SlateNode, Transforms } from 'slate'
import { PENX_101 } from '@penx/constants'
import { extractTags } from '@penx/editor-common'
import { getNodeByPath } from '@penx/editor-queries'
import {
  isListContentElement,
  isListElement,
  isListItemElement,
  ListItemElement,
  TitleElement,
  UnorderedListElement,
} from '@penx/list'
import { db, emitter } from '@penx/local-db'
import { Node } from '@penx/model'
import { INode, NodeType } from '@penx/model-types'
import { store } from '@penx/store'
import { NodeCleaner } from './NodeCleaner'

export class NodeService {
  nodeMap = new Map<string, INode>()

  childrenNodes: Node[] = []

  constructor(
    private node: Node,
    public allNodes: Node[],
  ) {
    if (node?.raw) {
      for (const item of allNodes) {
        this.nodeMap.set(item.id, item.raw)
      }

      this.childrenNodes = node.raw.children.map((id) => {
        return new Node(this.nodeMap.get(id)!)
      })
    }
  }

  get spaceId() {
    return this.node.spaceId
  }

  get markdownContent() {
    // return slateToMarkdown(this.doc.content)
    return ''
  }

  get parentNode() {
    const node = this.nodeMap.get(this.node.parentId)
    return node ? new Node(node) : null
  }

  isEqual(node: Node) {
    return node.id === this.node.id
  }

  // TODO: improve performance
  getParentNodes(): Node[] {
    const parentNodes: Node[] = [this.node]

    let node = this.node
    let i = 0
    while (this.node.parentId) {
      for (const item of this.allNodes) {
        if (node.parentId === item.id) {
          node = item
          if (node.type !== NodeType.ROOT) {
            parentNodes.unshift(item)
          }
        }
      }

      i++

      // fallback, if have some bug, break it forced
      if (i > 1000) break
    }

    return parentNodes
  }

  async selectNode(node?: Node) {
    store.node.selectNode(node?.raw || this.node.raw)
  }

  async toggleFolded(id: string, folded: boolean) {
    await db.updateNode(id, {
      folded: !folded,
    })

    const nodes = await db.listNodesBySpaceId(this.spaceId)

    store.node.setNodes(nodes)
  }

  private async saveTitle(node: INode, title: TitleElement) {
    if (!title) return

    if (this.node.isDatabase) {
      node = await db.updateNode(node.id, {
        props: { ...node.props, name: SlateNode.string(title) },
      })
    } else {
      // console.log('===========title.children:', title.children, title)
      node = await db.updateNode(node.id, {
        element: title.children,
      })
    }

    // update space name
    if (this.node.isRootNode) {
      await store.space.updateSpace(node.spaceId, {
        name: SlateNode.string(title),
      })
    }
  }

  saveBlockEditor = async (
    node: INode,
    value: any[] = [],
    isInReference = false,
  ) => {
    const [title, ...elements] = value
    await this.saveTitle(node, title)

    if (this.node.isDatabase || this.node.isDatabaseRoot) {
      return
    }

    await this.saveBlockNodes(node.id, elements)

    await new NodeCleaner().cleanDeletedNodes()

    const nodes = await db.listNodesBySpaceId(this.spaceId)

    store.node.setNodes(nodes)

    if (!isInReference) {
      const newNode = nodes.find((item) => item.id === node.id)!
      store.node.setFirstActiveNodes(newNode)
    }

    await store.sync.pushToCloud()
  }

  saveOutlinerEditor = async (
    node: INode,
    title: TitleElement,
    ul?: UnorderedListElement,
    isInReference = false,
  ) => {
    if (node.spaceId === PENX_101) return

    await this.saveTitle(node, title)

    if (ul && !this.node.isDatabase && !this.node.isDatabaseRoot) {
      await this.saveOutlinerNodes(node.id, ul)
    }

    await new NodeCleaner().cleanDeletedNodes()

    const nodes = await db.listNodesBySpaceId(this.spaceId)

    store.node.setNodes(nodes)

    if (!isInReference) {
      store.node.setFirstActiveNodes(node)
    }

    await store.sync.pushToCloud()
  }

  saveBlockNodes = async (parentId: string, elements: any[]) => {
    await db.updateNode(this.node.id, {
      children: elements.map((n) => n.id),
    })

    for (const item of elements) {
      const node = await db.getNode(item.id)

      const tags = extractTags([item])

      const isList = isListElement(item)

      if (node) {
        const newNode = await db.updateNode(item.id, {
          element: [item],
          children: [], // TODO:
        })

        if (isList) {
          await this.saveOutlinerNodes(item.id, item as any, false)
        }

        for (const tagName of tags) {
          await db.createTagRow(tagName, newNode.id)
        }

        if (tags.length) {
          emitter.emit('REF_NODE_UPDATED', newNode)
        }
      } else {
        let newNode: INode
        if (isList) {
          newNode = await db.createNode({
            id: item.id,
            parentId,
            type: NodeType.LIST,
            spaceId: this.spaceId,
            element: [item],
            children: [], // TODO:
          })

          await this.saveOutlinerNodes(item.id, item as any, false)
        } else {
          newNode = await db.createNode({
            id: item.id,
            parentId,
            spaceId: this.spaceId,
            element: [item],
            children: [], // TODO:
          })
        }

        for (const tagName of tags) {
          await db.createTagRow(tagName, newNode.id)
        }
      }
    }
  }

  saveOutlinerNodes = async (
    parentId: string,
    ul: UnorderedListElement,
    isOutliner = true,
  ) => {
    const editor = createEditor()
    Transforms.insertNodes(editor, ul)

    const childrenForCurrentNode = ul.children.map((listItem) => {
      return listItem.children[0].id
    })

    // update root node's children
    await db.updateNode(parentId, {
      children: childrenForCurrentNode,
    })

    const listContents = Editor.nodes(editor, {
      at: [],
      match: isListContentElement,
    })

    for (const [item, path] of listContents) {
      const parent = getNodeByPath(
        editor,
        path.slice(0, -1),
      ) as any as ListItemElement

      // get node children
      let children: string[] = []

      if (parent.children.length > 1) {
        const listItems = parent.children[1]
          .children as any as ListItemElement[]

        children = listItems.map((item) => item.children[0].id)
      }

      // node parentId
      const grandparent = getNodeByPath(editor, path.slice(0, -3))!

      let newParentId = parentId

      if (isListItemElement(grandparent)) {
        newParentId = grandparent.children[0].id
      }

      const key = [...path.slice(1)].reduce(
        (acc, cur) => [...acc, 'children', cur],
        [] as any[],
      )

      const element = _.get(ul, [...key, 'children'])

      const node = await db.getNode(item.id)

      const tags = extractTags(element)

      // console.log('=======tags:', tags, element)

      if (node) {
        const oldHash = new Node(node).toHash()
        const newHash = new Node({
          ...node,
          parentId: newParentId,
          element,
          collapsed: !!item.collapsed,
          children,
        }).toHash()

        if (oldHash !== newHash) {
          const updateData: Partial<INode> = {
            // type: isOutliner ? NodeType.COMMON : NodeType.LIST_ITEM,
            parentId: newParentId,
            element,
            collapsed: !!item.collapsed,
            children,
          }

          const newNode = await db.updateNode(item.id, updateData)

          for (const tagName of tags) {
            await db.createTagRow(tagName, newNode.id)
          }

          if (tags.length) {
            emitter.emit('REF_NODE_UPDATED', newNode)
          }
        }
      } else {
        await db.createNode({
          id: item.id,
          type: isOutliner ? NodeType.COMMON : NodeType.LIST_ITEM,
          parentId: newParentId,
          spaceId: this.spaceId,
          collapsed: !!item.collapsed,
          element,
          children,
        })
      }
    }
  }
}
