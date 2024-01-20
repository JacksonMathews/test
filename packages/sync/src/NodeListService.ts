import _ from 'lodash'
import { ELEMENT_BIDIRECTIONAL_LINK_CONTENT } from '@penx/constants'
import { ArraySorter } from '@penx/indexeddb'
import { Node, WithFlattenedProps } from '@penx/model'
import { INode, NodeType } from '@penx/model-types'

interface TreeItem extends Omit<INode, 'children'> {
  children: TreeItem[]
}

export type FindOptions<T = INode> = {
  where?: Partial<T>
  limit?: number
  orderByDESC?: boolean
  sortBy?: keyof T
}

export class NodeListService {
  nodes: Node[] = []

  nodeMap = new Map<string, Node>()

  constructor(public rawNodes: INode[] = []) {
    this.nodes = this.rawNodes.map((raw) => new Node(raw))

    for (const node of this.nodes) {
      this.nodeMap.set(node.id, node)
    }
  }

  get rootNode() {
    const rootNode = this.nodes.find((n) => n.isRootNode)!
    return rootNode
  }

  get databaseRootNode() {
    const databaseRootNode = this.nodes.find((n) => n.isDatabaseRoot)!
    return databaseRootNode
  }

  get dailyRootNode() {
    const dailyRootNode = this.nodes.find((n) => n.isDailyRoot)!
    return dailyRootNode
  }

  get inboxNode() {
    const rootNode = this.nodes.find((n) => n.isInbox)!
    return rootNode
  }

  get trashNode() {
    const rootNode = this.nodes.find((n) => n.isTrash)!
    return rootNode
  }

  get favoriteNode() {
    const favoriteNode = this.nodes.find((n) => n.isFavorite)!
    return favoriteNode
  }

  get rootNodes() {
    if (!this.nodes?.length) return []
    return this.rootNode.children
      .map((id) => this.nodeMap.get(id)!)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
  }

  get tagNodes() {
    return this.nodes.filter((n) => n.type === NodeType.DATABASE)
  }

  get trashedNodes() {
    return this.nodes.filter((node) => node.isTrash)
  }

  getNode(id: string) {
    return this.nodeMap.get(id)!
  }

  flattenNode(node: Node) {
    return this.flattenChildren(node.children)
  }

  createTree(node: Node): TreeItem[] {
    return node.children.map((id) => {
      const node = this.nodeMap.get(id)!

      if (!node.children.length) {
        return { ...node.raw, children: [] }
      }
      return {
        ...node.raw,
        children: this.createTree(node),
      }
    })
  }

  private flattenChildren(
    children: string[] = [],
    parentId: string | null = null,
    depth = 0,
  ): WithFlattenedProps<Node>[] {
    return children.reduce<WithFlattenedProps<Node>[]>((acc, id, index) => {
      const node = this.getNode(id)
      if (!node) return acc // TODO:

      // copy a new node
      const flattenedNode = Object.assign(new Node({ ...node.raw }), {
        parentId,
        depth,
        index,
      })
      acc.push(flattenedNode)

      if (node.hasChildren) {
        acc.push(...this.flattenChildren(node.children, node.id, depth + 1))
      }

      return acc
    }, [])
  }

  getFavorites() {
    if (!this.favoriteNode?.children) return []
    return this.favoriteNode.children
      .map((id) => this.nodeMap.get(id)!)
      .filter((n) => !!n)
  }

  isFavorite(id: string) {
    return this.favoriteNode.children.includes(id)
  }

  getLinkedReferences(node: Node) {
    const nodes: Node[] = []

    for (const item of this.nodes) {
      if (item.id === node.id) continue
      if (!item.isCommon) continue

      const isLinked = () => {
        if (!Array.isArray(item.element)) {
          console.log('---ite-mmmmmmm:', item, item.element, item.raw.element)
        }

        // console.log('========item.element:', item, item.element)

        const children = item.element.reduce((acc, cur) => {
          if (!cur.children) return acc
          return [...acc, ...cur.children]
        }, [] as any[])

        const some = children.some((i) => {
          return (
            i.type == ELEMENT_BIDIRECTIONAL_LINK_CONTENT && i.linkId === node.id
          )
        })
        return some
      }

      if (isLinked()) nodes.push(item)
    }
    return nodes.sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())
  }

  // TODO: need to improvement
  find(options: FindOptions = {}): Node[] {
    const data = this.rawNodes
    let result: INode[] = []

    // handle where
    if (Reflect.has(options, 'where') && options.where) {
      const whereKeys = Object.keys(options.where)

      result = data.filter((item) => {
        const dataKeys = Object.keys(item)

        const every = whereKeys.every((key) => {
          return (
            dataKeys.includes(key) &&
            (item as any)[key] === (options.where as any)[key]
          )
        })

        return every
      })

      // handle sortBy
      if (Reflect.has(options, 'sortBy') && options.sortBy) {
        // sort data
        result = new ArraySorter<INode>(result).sortBy({
          desc: Reflect.has(options, 'orderByDESC') && options.orderByDESC,
          keys: [options.sortBy as string],
        })
      }

      if (Reflect.has(options, 'limit') && options.limit) {
        // slice data
        result = result.slice(0, +options.limit)
      }
    }

    return result.map((raw) => new Node(raw))
  }
}
