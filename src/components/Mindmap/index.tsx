import { InboxOutlined } from '@ant-design/icons';
import {
  EventListenerOrEventListenerObject,
  EventTarget,
  Group,
  Rect,
  Text,
  TextStyleProps,
} from '@antv/g';
import {
  AnimationOptions,
  AnimationStage,
  Badge,
  BadgeStyleProps,
  BaseNode,
  BaseNodeStyleProps,
  CommonEvent,
  ExtensionCategory,
  Graph,
  GraphData,
  idOf,
  NodeData,
  NodeLikeData,
  positionOf,
  register,
  TreeData,
  treeToGraphData,
} from '@antv/g6';
import { NodeStyle } from '@antv/g6/lib/spec/element/node';
import { Button, Upload } from 'antd';
import { useEffect, useRef, useState } from 'react';
const { Dragger } = Upload;

// 可用 easing https://github.com/antvis/G/blob/dd3e8f2105db316903de34c7f2b982babdb1c60a/packages/g-web-animations-api/src/utils/custom-easing.ts#L183
const globalAnim: Record<AnimationStage, false | string | AnimationOptions[]> =
  {
    expand: [{ fields: ['x', 'y'], easing: 'out-quart' }],
    collapse: [{ fields: ['x', 'y'], easing: 'out-quart' }],
  };

const RootNodeStyle: NodeStyle = {
  fill: '#FFFFFF',
  labelFill: '#262626',
  labelFontSize: 24,
  labelFontWeight: 600,
  labelPlacement: 'center',
  labelLineHeight: 34,
  radius: 8,
};

const MNodeStyle: NodeStyle = {
  fill: '#FFFFFF',
  labelPlacement: 'center',
  labelFontSize: 16,
  labelLineHeight: 20,
  radius: 6,
};

const getNodeSide = (nodeData: NodeLikeData, parentData: NodeLikeData) => {
  if (!parentData) return 'center';
  const nodePositionX = positionOf(nodeData)[0];
  const parentPositionX = positionOf(parentData)[0];
  return parentPositionX > nodePositionX ? 'left' : 'right';
};

let textShape: Text;
const measureText = (text: TextStyleProps) => {
  if (!textShape) textShape = new Text({ style: text });
  textShape.attr(text);
  const bbox = textShape.getBBox();
  const width = bbox.width;
  const height = bbox.height;
  return [width, height];
};

const getNodeSize = (text: string, isRoot: boolean): [number, number] => {
  const paddingX = isRoot ? 40 : 30;
  const paddingY = isRoot ? 20 : 12;
  const nodeStyle = isRoot ? RootNodeStyle : MNodeStyle;
  const [width, height] = measureText({
    text,
    fontSize: nodeStyle.labelFontSize,
    lineHeight: nodeStyle.labelLineHeight,
  });
  return [width + paddingX, height + paddingY];
};

interface MindmapNodeStyleProps extends BaseNodeStyleProps {
  direction: string;
}

class MindmapNode extends BaseNode {
  get data() {
    return this.context.model.getNodeLikeDatum(this.id);
  }

  get childrenData() {
    return this.context.model.getChildrenData(this.id);
  }

  get rootId() {
    return idOf(this.context.model.getRootsData()[0]);
  }

  getCollapseStyle(
    attributes: Required<MindmapNodeStyleProps>,
  ): false | BadgeStyleProps {
    if (this.childrenData.length === 0 || this.id === this.rootId) return false;
    const { direction, collapsed } =
      attributes as Required<MindmapNodeStyleProps> & { direction: string };
    const [width, height] = this.getSize(attributes);
    const dir = direction === 'left';
    let text = '';
    let size = 0;
    if (collapsed) {
      const cnt = this.context.model.getDescendantsData(this.id).length;
      size = cnt < 100 ? 12 : 8;
      text = cnt.toString();
    } else {
      size = 16;
      text = '-';
    }
    return {
      backgroundFill: '#fff',
      backgroundHeight: 18,
      backgroundLineWidth: 1,
      backgroundRadius: 18,
      backgroundStroke: '#99ADD1',
      backgroundWidth: 18,
      cursor: 'pointer',
      fill: '#99ADD1',
      fontSize: size,
      text: text,
      textAlign: 'center',
      textBaseline: 'middle',
      x: dir ? -6 : width + 6,
      y: height / 2,
    };
  }

  drawCollapseShape(
    attributes: Required<MindmapNodeStyleProps>,
    container: Group,
  ) {
    const iconStyle = this.getCollapseStyle(attributes);
    const btn = this.upsert('collapse', Badge, iconStyle, container)!;

    this.forwardEvent(btn, CommonEvent.CLICK, () => {
      const { collapsed } = this.attributes;
      const graph = this.context.graph;
      if (collapsed) {
        graph.expandElement(this.id);
        // await graph.focusElement(this.id);
      } else {
        graph.collapseElement(this.id);
        // await graph.focusElement(this.id);
      }
    });
  }

  forwardEvent<T extends EventTarget>(
    target: T,
    type: string,
    listener: EventListenerOrEventListenerObject | ((...args: any[]) => void),
  ) {
    if (target && !Reflect.has(target, '__bind__')) {
      Reflect.set(target, '__bind__', true);
      target.addEventListener(type, listener);
    }
  }

  getKeyStyle(attributes: Required<MindmapNodeStyleProps>) {
    const [width, height] = this.getSize(attributes);
    const keyShape = super.getKeyStyle(attributes);
    return { width, height, ...keyShape };
  }

  drawKeyShape(attributes: Required<MindmapNodeStyleProps>, container: Group) {
    const keyStyle = this.getKeyStyle(attributes);
    return this.upsert('key', Rect, keyStyle, container);
  }

  render(attributes: Required<MindmapNodeStyleProps>, container: Group = this) {
    super.render(attributes, container);
    this.drawCollapseShape(attributes, container);
  }
}

register(ExtensionCategory.NODE, 'mindmap', MindmapNode);

interface ReactMindmapProps {
  mindJson?: string;
  isReadonly: boolean;
}

export default (props: ReactMindmapProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [g6, setG6] = useState<Graph | null>(null);
  const [mindData, setMindData] = useState<string | null>(
    props.mindJson ?? null,
  );
  const [zoom, setZoomData] = useState<number>(0);

  const parseMindJson = (jsonStr: string) => {
    const data = JSON.parse(jsonStr);
    if (data === null || typeof data !== 'object') {
      throw new Error('invalid json');
    }
    if (!data.verts || !data.edges) {
      throw new Error("invalid json schema, need 'verts' and 'edges'");
    }
    {
      const ids = new Set<string>();
      for (const i of data.verts) {
        if (ids.has(i.id)) {
          throw new Error(`duplicate vertex id ${i.id}`);
        }
        ids.add(i.id);
      }
      for (const i of data.edges) {
        if (!ids.has(i.from) || !ids.has(i.to)) {
          throw new Error(`unknown vertexs id ${i.from} ${i.to} in edge`);
        }
      }
    }
    const treeData: TreeData[] = [];
    for (const i of data.verts) {
      treeData.push({
        id: i.id,
        children: [],
        data: { ...i },
        parent: [],
      });
    }
    for (const i of data.edges) {
      const from = treeData.find((x) => x.id === i.from)!;
      const to = treeData.find((x) => x.id === i.to)!;
      from.children!.push(to);
      to.parent.push(from);
    }
    for (const i of treeData) {
      if (i.parent.length > 1) {
        throw new Error(`tree node cannot has more than one parent ${i.id}`);
      }
    }
    const root: TreeData[] = [];
    for (const i of treeData) {
      if (i.parent.length === 0) {
        root.push(i);
      }
    }
    if (root.length <= 0 || root.length > 1) {
      throw new Error(
        `more than one root, roots id=${root.map((x) => x.id).join(',')}`,
      );
    }
    return { graphData: treeToGraphData(root[0]), rootId: root[0].id };
  };

  const newGraph = (graphData: GraphData, rootId: string) => {
    const g = new Graph({
      container: containerRef.current!,
      data: graphData,
      node: {
        type: 'mindmap',
        style: function (d: NodeData): NodeStyle {
          const labelText = (d.data?.str as string) ?? idOf(d);
          const direction = getNodeSide(
            d,
            this.getParentData(idOf(d), 'tree')!,
          );
          const isRoot = idOf(d) === rootId;
          return {
            direction,
            labelText: labelText,
            size: getNodeSize(labelText, isRoot),
            ports: [{ placement: 'right' }, { placement: 'left' }],
            ...(isRoot ? RootNodeStyle : MNodeStyle),
          };
        },
        animation: globalAnim,
      },
      edge: {
        type: 'cubic-horizontal',
        style: {
          lineWidth: 3,
          stroke: '#99ADD1',
        },
        animation: globalAnim,
      },
      layout: {
        type: 'mindmap',
        direction: 'H',
        getWidth: (node: NodeLikeData) =>
          getNodeSize(
            (node.data?.str as string) ?? idOf(node),
            node.id === rootId,
          )[0],
        getHeight: (node: NodeLikeData) =>
          getNodeSize(
            (node.data?.str as string) ?? idOf(node),
            node.id === rootId,
          )[1],
        getVGap: () => 6,
        getHGap: () => 30,
      },
      behaviors: [
        {
          key: 'zoom-canvas',
          type: 'zoom-canvas',
          enable: true,
          sensitivity: 0.5,
          onFinish: () => {
            setZoomData(g.getZoom());
          },
        },
        'drag-canvas',
      ],
      animation: {
        duration: 300,
      },
    });
    return g;
  };

  // useEffect 第二个参数不填东西, 表示该side effect无依赖, 因此只在dom加载后执行一次 (这不就是 unity 生命周期 start 函数嘛
  // 当 effect 有依赖时, 依赖发生变化后都会调用一次刷新side effect
  useEffect(() => {
    if (mindData === null) {
      if (g6 !== null) {
        g6.destroy();
        setG6(null);
      }
    } else {
      let graphData: GraphData | null = null;
      let rootId: string | null = null;
      try {
        const result = parseMindJson(mindData);
        graphData = result.graphData;
        rootId = result.rootId;
      } catch (error) {
        console.error(error);
        return;
      }
      if (g6) {
        g6.setData(graphData);
        g6.render()
          .then(() => g6.fitView())
          .then(() => setZoomData(g6.getZoom()));
      } else {
        const newG = newGraph(graphData, rootId);
        newG
          .render()
          .then(() => newG.fitView())
          .then(() => setZoomData(newG.getZoom()));
        setG6(newG);
      }
    }
  }, [mindData]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        width: '100%',
        height: '100%',
        position: 'relative',
      }}
    >
      {!props.isReadonly && !mindData && (
        <Dragger
          style={{
            display: mindData === null ? 'block' : 'none',
          }}
          name="file"
          multiple={false}
          showUploadList={false}
          accept=".json"
          beforeUpload={(file) => {
            file.text().then((text) => {
              setMindData(text);
            });
          }}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">
            Click or drag file to this area to upload
          </p>
          <p className="ant-upload-hint">
            Support for a single or bulk upload. Strictly prohibited from
            uploading company data or other banned files.
          </p>
        </Dragger>
      )}
      {mindData && (
        <div
          ref={containerRef}
          style={{
            width: '100%',
            height: '100%',
            display: mindData !== null ? 'block' : 'none',
          }}
        />
      )}
      {mindData && (
        <div
          style={{
            position: 'absolute',
            right: 0,
          }}
        >
          {!props.isReadonly && (
            <Button
              onClick={() => {
                setMindData(null);
              }}
            >
              删除
            </Button>
          )}
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
        }}
      >
        <Button
          onClick={() => {
            g6?.fitCenter();
          }}
        >
          C
        </Button>
        <Button
          onClick={() => {
            g6?.zoomBy(0.8).then(() => setZoomData(g6?.getZoom()));
          }}
        >
          -
        </Button>
        {(zoom * 100).toFixed(0)}%
        <Button
          onClick={() => {
            g6?.zoomBy(1.2).then(() => setZoomData(g6?.getZoom()));
          }}
        >
          +
        </Button>
      </div>
    </div>
  );
};
