import { Node, Path, Transforms } from 'slate'
import { modalController, toast } from 'uikit'
import { ModalNames } from '@penx/constants'
import { ContextMenu, MenuItem } from '@penx/context-menu'
import { useEditorStatic } from '@penx/editor-common'
import { findNodePath } from '@penx/editor-queries'
import { IDatabaseNode, NodeType } from '@penx/model-types'
import { useCopyToClipboard } from '@penx/shared'
import { store } from '@penx/store'
import { ListContentElement } from '../types'

interface Props {
  menuId: string
  element: ListContentElement
}

export const BulletMenu = ({ menuId, element }: Props) => {
  const editor = useEditorStatic()
  const path = findNodePath(editor, element)!
  const { copy } = useCopyToClipboard()

  function handleItemClick(type: string) {
    if (type === 'DELETE') {
      if (element.nodeType === NodeType.DATABASE) {
        const database = editor.items.find((i) => i.id === element.id)!
        modalController.open(ModalNames.DELETE_DATABASE, database)
      } else {
        Transforms.removeNodes(editor, { at: Path.parent(path) })
      }
    }
  }

  function copyNodeId() {
    copy(element.id)
    toast.info('Copied to clipboard')
  }

  async function openInNewPanel() {
    await store.node.openInNewPanel(element.id)
  }

  // console.log('bullet menu.............', Node.string(element))

  return (
    <ContextMenu id={menuId}>
      {/* <MenuItem onClick={() => handleItemClick('a')}>Add to favorite</MenuItem> */}
      <MenuItem onClick={openInNewPanel}>Open in new panel</MenuItem>
      {/* <MenuItem onClick={() => handleItemClick('b')}>Publish</MenuItem> */}
      <MenuItem onClick={copyNodeId}>Copy node ID</MenuItem>
      <MenuItem onClick={() => handleItemClick('DELETE')}>Delete</MenuItem>
      {/* <MenuItem onClick={() => handleItemClick('d')}>Expand all</MenuItem> */}
      {/* <MenuItem onClick={() => handleItemClick('d')}> Collapse all</MenuItem> */}
    </ContextMenu>
  )
}
