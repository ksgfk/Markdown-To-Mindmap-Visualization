import { DeleteOutlined, DownloadOutlined, ExclamationCircleFilled, InboxOutlined, MinusOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
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
import { Button, Divider, Modal, Upload, message } from 'antd';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

// 可用 easing https://github.com/antvis/G/blob/dd3e8f2105db316903de34c7f2b982babdb1c60a/packages/g-web-animations-api/src/utils/custom-easing.ts#L183
// easing 函数可视化 https://easings.net/zh-cn
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

export interface EduMindmapProps {
  mindJson?: string;
  isReadonly: boolean;
  exportName?: string;
}

export interface IEduMindmap {
  serializeMindmapData: () => string | undefined;
  setMindStringJson: (json: string) => void;
}

export interface EduMindmapVertex {
  id: string,
  str: string | undefined
}

type EduMindmapG6Data = Omit<EduMindmapVertex, 'id'>;

export interface EduMindmapEdge {
  from: string,
  to: string
}

export interface EduMindmapGraph {
  verts: EduMindmapVertex[],
  edges: EduMindmapEdge[]
}

export const EduMindmap = forwardRef<IEduMindmap, EduMindmapProps>((props: EduMindmapProps, ref) => {
  const rightBottomBtnStyle = {
    border: "none",
    padding: "4px 10px",
    color: "#606266",
    boxShadow: "none"
  };
  const rightTopBtnStyle = {
    marginLeft: "8px"
  };

  const downloadJson = (jsonStr: string, filename: string) => {
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const convertMindmapData = (data: EduMindmapGraph, isVerify?: boolean) => {
    if (isVerify) {
      if (data === null || typeof data !== 'object') {
        throw new Error('invalid json');
      }
      if (!data.verts || !data.edges) {
        throw new Error("invalid json schema, need 'verts' and 'edges'");
      }
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
      const data: EduMindmapG6Data = { ...i }; // :)
      treeData.push({
        id: i.id,
        children: [],
        data,
        parent: [],
      });
    }
    for (const i of data.edges) {
      const from = treeData.find((x) => x.id === i.from)!;
      const to = treeData.find((x) => x.id === i.to)!;
      from.children!.push(to);
      to.parent.push(from);
    }
    if (isVerify) {
      for (const i of treeData) {
        if (i.parent.length > 1) {
          throw new Error(`tree node cannot has more than one parent ${i.id}`);
        }
      }
    }
    const root: TreeData[] = [];
    for (const i of treeData) {
      if (i.parent.length === 0) {
        root.push(i);
      }
    }
    if (isVerify) {
      if (root.length <= 0) {
        throw new Error('must have one root');
      }
      if (root.length > 1) {
        throw new Error(
          `more than one root, roots id=${root.map((x) => x.id).join(',')}`,
        );
      }
    }
    return root[0];
  }

  const deserializeMindmapData = (jsonStr: string) => {
    const initMindData: EduMindmapGraph | null = JSON.parse(jsonStr);
    const root = convertMindmapData(initMindData!, true);
    const graph = treeToGraphData(root);
    return { graph, rootId: root.id };
  };

  let initMindData: GraphData | null = null;
  let initRootId: string | null = null;
  if (props.mindJson) {
    try {
      const { graph, rootId } = deserializeMindmapData(props.mindJson);
      initMindData = graph;
      initRootId = rootId;
    } catch (error) {
      console.error(error);
      message.error("无效的知识图谱数据");
    }
  }

  const containerRef = useRef<HTMLDivElement>(null);
  const [g6, setG6] = useState<Graph | null>(null);
  const [resizeOb, setResizeOb] = useState<ResizeObserver | null>(null);
  const [mindData, setMindData] = useState<GraphData | null>(initMindData);
  const [rootIdData, setRootIdData] = useState<string | null>(initRootId);
  const rootIdDataRef = useRef(rootIdData); // 乐 :)
  useEffect(() => {
    rootIdDataRef.current = rootIdData
  }, [rootIdData]);
  const [zoom, setZoomData] = useState<number>(0);
  const [isDeleteModal, setIsDeleteModal] = useState(false);

  const newGraph = (graphData: GraphData | undefined) => {
    const g = new Graph({
      container: containerRef.current!,
      data: graphData,
      node: {
        type: 'mindmap',
        style: (d: NodeData): NodeStyle => {
          const labelText = (d.data?.str as string) ?? idOf(d);
          const direction = getNodeSide(
            d,
            g.getParentData(idOf(d), 'tree')!,
          );
          const isRoot = idOf(d) === rootIdDataRef.current;
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
            node.id === rootIdDataRef.current,
          )[0],
        getHeight: (node: NodeLikeData) =>
          getNodeSize(
            (node.data?.str as string) ?? idOf(node),
            node.id === rootIdDataRef.current,
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
          trigger: ['Control'],
        },
        'drag-canvas',
      ],
      animation: {
        duration: 300,
      },
    });
    return g;
  };

  const serializeMindmapData = () => {
    if (g6 === null) {
      return undefined;
    }
    const g = g6.getData();
    const result: EduMindmapGraph = {
      verts: [],
      edges: [],
    };
    for (const i of g.nodes) {
      result.verts.push({
        id: i.id,
        ...(i.data as unknown as EduMindmapG6Data)
      });
    }
    for (const i of g.edges) {
      result.edges.push({
        from: i.source,
        to: i.target
      });
    }
    return JSON.stringify(result);
  }

  const setMindStringJson = (json: string) => {
    try {
      const { graph, rootId } = deserializeMindmapData(json);
      setRootIdData(rootId);
      setMindData(graph);
    } catch (error) {
      console.error(error);
      message.error("无效的知识图谱数据");
    }
  }

  useImperativeHandle(ref, () => (
    {
      serializeMindmapData,
      setMindStringJson
    }
  ));

  // useEffect 第二个参数不填东西, 表示该side effect无依赖, 因此只在dom加载后执行一次 (这不就是 unity 生命周期 start 函数嘛
  // 当 effect 有依赖时, 依赖发生变化后都会调用一次刷新side effect
  useEffect(() => {
    const newG = newGraph(mindData ?? undefined);
    newG.render()
      .then(() => newG.fitView())
      .then(() => setZoomData(newG.getZoom()));
    setG6(newG);
    if (resizeOb === null) {
      const t = new ResizeObserver(() => {
        const c = containerRef.current;
        if (c) {
          const rect = c.getBoundingClientRect();
          newG.resize(rect.width, rect.height);
        }
      });
      t.observe(containerRef.current!);
      setResizeOb(t);
    }
    return () => {
      newG.destroy();
      resizeOb?.disconnect();
    }
  }, []);

  useEffect(() => {
    if (mindData === null) {
      g6?.setData({ nodes: [], edges: [] });
      g6?.render();
    } else {
      g6?.setData(mindData);
      g6?.render()
        .then(() => g6.fitView())
        .then(() => setZoomData(g6.getZoom()));
    }
  }, [mindData]);

  return <>
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
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
        }}
      />
      {!props.isReadonly && !mindData && <>
        <div style={{
          width: '100%',
          height: '100%',
        }}>
          <Upload.Dragger
            style={{
              width: '100%',
              height: '100%',
            }}
            name="file"
            multiple={false}
            showUploadList={false}
            accept=".json"
            beforeUpload={(file) => {
              file.text().then((text) => {
                try {
                  const { graph, rootId } = deserializeMindmapData(text);
                  setRootIdData(rootId);
                  setMindData(graph);
                } catch (error) {
                  console.error(error);
                  message.error("无效的知识图谱数据");
                  return;
                }
              });
            }}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">
              单击或拖动文件到此区域进行上传
            </p>
            <p className="ant-upload-hint">
              需要上传格式为 json 的文件
            </p>
          </Upload.Dragger>
        </div>
      </>}
      {mindData && (
        <div
          style={{
            position: 'absolute',
            right: 0,
          }}
        >
          {!props.isReadonly && <>
            <Button
              style={rightTopBtnStyle}
              onClick={() => {
                setIsDeleteModal(true);
              }}
            >
              <DeleteOutlined />删除
            </Button>
            <Button
              style={rightTopBtnStyle}
              onClick={() => {
                const str = serializeMindmapData();
                if (str === undefined) {
                  message.error("无效的知识图谱数据");
                  return;
                }
                downloadJson(str, props.exportName ?? "知识图谱.json");
              }}
            >
              <DownloadOutlined />导出
            </Button>
          </>}
        </div>
      )}
      {mindData && <>
        <div
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            outline: '1px solid #E4E7ED',
            borderRadius: '4px',
            display: "flex",
            alignItems: "center"
          }}
        >
          <Button
            style={rightBottomBtnStyle}
            onClick={() => {
              g6?.fitCenter();
            }}
          >
            <ReloadOutlined />
          </Button>
          <Divider
            type="vertical"
            style={{
              color: "#E4E7ED",
              top: "0",
              height: "1.6em",
              marginInline: "2px"
            }}
          />
          <Button
            style={rightBottomBtnStyle}
            onClick={() => {
              g6?.zoomBy(0.8).then(() => setZoomData(g6?.getZoom()));
            }}
          >
            <MinusOutlined />
          </Button>
          <div
            style={{
              width: "50px",
              textAlign: "center"
            }}>
            {(zoom * 100).toFixed(0)}%
          </div>
          <Button
            style={rightBottomBtnStyle}
            onClick={() => {
              g6?.zoomBy(1.2).then(() => setZoomData(g6?.getZoom()));
            }}
          >
            <PlusOutlined />
          </Button>
        </div>
      </>}
    </div>
    <Modal
      title={<><ExclamationCircleFilled /> 确认</>}
      open={isDeleteModal}
      onOk={() => {
        setRootIdData(null);
        setMindData(null);
        setIsDeleteModal(false);
      }}
      onCancel={() => {
        setIsDeleteModal(false);
      }}
      okText="确认"
      cancelText="取消">
      真的要删除知识图谱吗？
    </Modal>
  </>;
});
