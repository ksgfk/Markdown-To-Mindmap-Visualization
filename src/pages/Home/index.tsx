import { useEffect, useRef } from 'react';
import { EduMindmap, EduMindmapGraph, IEduMindmap } from '../../components/Mindmap';
import Vditor from 'vditor';
import "vditor/src/assets/less/index.less";
import { Transformer } from 'markmap-lib';
import { IPureNode } from 'markmap-common';

interface InputState {
  timeout: number | null
}

interface ConvertNode {
  parent: ConvertNode | null;
  data: IPureNode;
  id: number;
}

export default () => {
  const editorRef = useRef<HTMLDivElement>(null);
  const mindmapRef = useRef<IEduMindmap>(null);

  const inputState: InputState = {
    timeout: null
  };

  const isNullOrWhiteSpace = (str: string) => {
    return str === undefined || str === null || str.length === 0 || str.match(/^ *$/) !== null;
  }

  const updateMinmap = (value: string) => {
    const transformer = new Transformer();
    const result = transformer.transform(value);
    if (isNullOrWhiteSpace(result.root.content) && result.root.children.length === 0) {
      return;
    }
    const flat: ConvertNode[] = [];
    {
      const q: ConvertNode[] = [];
      let id = 0;
      q.push({ parent: null, data: result.root, id: id++ });
      while (q.length > 0) {
        const n = q.shift()!;
        if (n.data.children) {
          for (const child of n.data.children) {
            q.push({ parent: n, data: child, id: id++ });
          }
        }
        flat.push(n);
      }
    }
    const graph: EduMindmapGraph = { verts: [], edges: [] };
    for (const i of flat) {
      graph.verts.push({ id: i.id.toString(), str: isNullOrWhiteSpace(i.data.content) ? undefined : i.data.content });
      if (i.parent) {
        graph.edges.push({ from: i.parent.id.toString(), to: i.id.toString() });
      }
    }
    const mindJson = JSON.stringify(graph);
    mindmapRef.current!.setMindStringJson(mindJson);
  };

  useEffect(() => {
    const vditor = new Vditor(editorRef.current!, {
      height: "94vh",
      width: "50%",
      typewriterMode: true,
      placeholder: '# 你好',
      cache: {
        enable: false,
      },
      toolbarConfig: {
        pin: true,
      },
      preview: {
        mode: 'both',
      },
      mode: "sv",
      input: (value: string) => {
        if (inputState.timeout !== null) {
          window.clearTimeout(inputState.timeout);
        }
        inputState.timeout = window.setTimeout(() => {
          updateMinmap(value);
        }, 750);
      }
    });
    return () => {
      vditor.destroy();
    };
  });

  return <>
    <div
      style={{
        display: "flex",
        flexDirection: "row"
      }}
    >
      <div ref={editorRef} />
      <div
        style={{
          width: "50%",
          height: '94vh',
          backgroundColor: '#ffffff',
          marginLeft: '10px',
          border: '1px solid #e8e8e8',
        }}
      >
        <EduMindmap
          ref={mindmapRef}
          isReadonly={false}
          mindJson={`{"verts": [{"id": "1","str": "你好"}],"edges": []}`}
        />
      </div>
    </div>
  </>
};
