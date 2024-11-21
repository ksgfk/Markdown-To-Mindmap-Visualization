import { useEffect, useRef, useState } from 'react';
import { EduMindmap, EduMindmapGraph, IEduMindmap } from '../../components/Mindmap';
import { Transformer } from 'markmap-lib';
import { IPureNode } from 'markmap-common';
import { basicSetup, EditorView } from "codemirror"
import { markdown } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { Button } from 'antd';

interface InputState {
  timeout: number | null
}

interface ConvertNode {
  parent: ConvertNode | null;
  data: IPureNode;
  id: number;
}

const removeHtmlTags = (str: string) => {
  return str.replace(/<\/?[^>]+(>|$)/g, "");
};

export default () => {
  const downloadMarkdown = (str: string, filename: string) => {
    const blob = new Blob([str], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const editorRef = useRef<HTMLDivElement>(null);
  const mindmapRef = useRef<IEduMindmap>(null);
  const [editorView, setEditorView] = useState<EditorView | null>(null);

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
      graph.verts.push({ id: i.id.toString(), str: isNullOrWhiteSpace(i.data.content) ? undefined : removeHtmlTags(i.data.content.trim()) });
      if (i.parent) {
        graph.edges.push({ from: i.parent.id.toString(), to: i.id.toString() });
      }
    }
    const mindJson = JSON.stringify(graph);
    mindmapRef.current!.setMindStringJson(mindJson);
  };

  useEffect(() => {
    const view = new EditorView({
      doc: "# 你好",
      extensions: [
        basicSetup,
        markdown({ codeLanguages: languages }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            if (inputState.timeout !== null) {
              window.clearTimeout(inputState.timeout);
            }
            inputState.timeout = window.setTimeout(() => {
              const str = update.state.doc.toString();
              updateMinmap(str);
            }, 750);
          }
        })
      ],
      parent: editorRef.current!,
    })
    setEditorView(view);
    return () => {
      view.destroy();
    }
  }, []);

  return <>
    <div
      style={{
        display: "flex",
        flexDirection: "row"
      }}
    >
      <div
        style={{
          width: "50%",
          height: '94vh',
          border: '1px solid #e8e8e8',
          overflow: "clip"
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end'
          }}>
          <Button
            onClick={() => {
              const str = editorView?.state.doc.toString() ?? "";
              const t = editorView?.state.doc.lineAt(0).text ?? "新建文档";
              downloadMarkdown(str, `${t}.md`);
            }}>
            保存
          </Button>
        </div>
        <div
          ref={editorRef}
          style={{
            height: "100%",
            border: '1px solid #e8e8e8',
            overflow: "scroll"
          }}
        />
      </div>
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
