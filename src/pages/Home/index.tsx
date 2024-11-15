import Mindmap from '../../components/Mindmap';

export default () => {
  return (
    <>
      <div
        style={{
          height: '94vh',
        }}
      >
        <Mindmap
          isReadonly={false}
          mindJson={`{"verts": [{"id": "1","str": "你好"}],"edges": []}`}
        />
      </div>
    </>
  );
};
