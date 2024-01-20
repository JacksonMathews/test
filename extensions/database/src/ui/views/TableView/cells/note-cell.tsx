import isEqual from 'react-fast-compare'
import { Box, css, FowerHTMLProps } from '@fower/react'
import {
  CustomCell,
  CustomRenderer,
  drawTextCell,
  GridCellKind,
} from '@glideapps/glide-data-grid'
import { Node } from 'slate'
import { Bullet } from 'uikit'
import { Node as NodeModel } from '@penx/model'
import { EditorMode, ICellNode, IColumnNode } from '@penx/model-types'
import { NodeService } from '@penx/service'
import { store } from '@penx/store'
import { PrimaryCell } from '../../../Table/Cell/PrimaryCell'

interface NoteCellProps {
  kind: 'note-cell'
  data: ICellNode
  column: IColumnNode
}

export type NoteCell = CustomCell<NoteCellProps>

export const noteCellRenderer: CustomRenderer<NoteCell> = {
  kind: GridCellKind.Custom,
  isMatch: (c): c is NoteCell => (c.data as any).kind === 'note-cell',
  draw: (args, cell) => {
    const { ctx, theme, rect } = args

    const cellNode = cell.data.data
    const { ref } = cellNode.props
    const node = store.node.getNode(ref)

    if (!node?.element) {
      drawTextCell(args, 'EMPTY')
      return true
    }

    const elements = Array.isArray(node.element) ? node.element : [node.element]

    const str = elements
      .map((n: any) => {
        if (Array.isArray(n.children)) {
          return n.children.reduce((acc: string, n: any) => {
            if (n?.type === 'tag') {
              return acc + ('#' + n?.name || '')
            }
            return acc + Node.string(n)
          }, '')
        } else {
          return Node.string(n)
        }
      })
      .join('')
    // console.log('node=======:', node.element, 'str==:', str)

    drawTextCell(args, str)
    return true
  },
  provideEditor: () => ({
    editor: (p) => {
      const { value, onChange, onFinishedEditing } = p
      const { column, data: cellNode } = value.data
      let newValue = value

      async function clickBullet() {
        const node = store.node.getNode(cellNode.props.ref!)
        const space = store.space.getActiveSpace()
        const isOutliner = space.editorMode === EditorMode.OUTLINER
        if (isOutliner) {
          node && store.node.selectNode(node)
        } else {
          const nodes = store.node.getNodes()
          const nodeService = new NodeService(
            new NodeModel(node),
            nodes.map((n) => new NodeModel(n)),
          )
          const parentNodes = nodeService.getParentNodes()

          if (parentNodes[0].isDailyRoot) {
            store.node.selectNode(parentNodes[1].raw)
          } else {
            store.node.selectNode(parentNodes[0].raw)
          }
        }
      }
      return (
        <Box w-300 toCenterY>
          <Bullet
            dashed
            outlineColor="transparent"
            borderNeutral400
            style={{
              flexShrink: 0,
            }}
            onClick={(e) => {
              e.stopPropagation()
              clickBullet()
            }}
          />
          <PrimaryCell
            index={0}
            cell={cellNode}
            column={column}
            width={0}
            onChange={(element) => {
              let newElement = Array.isArray(element) ? element : [element]
              newValue = {
                ...value,
                data: {
                  ...value.data,
                  data: {
                    ...value.data.data,
                    element: newElement,
                  },
                },
              }

              onChange(newValue)
            }}
            onBlur={() => {
              onFinishedEditing(newValue)
            }}
            selected={false}
            updateCell={() => {}}
          />
        </Box>
      )
    },
  }),
}
