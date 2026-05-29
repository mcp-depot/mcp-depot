import { useState, useCallback } from 'react';

export function JsonTree({ data, selectedFields = new Set(), onFieldSelect, onFieldDeselect }) {
  if (data === null || data === undefined) {
    return <span className="json-null">null</span>;
  }
  if (typeof data !== 'object') {
    return (
      <span className={`json-value json-${typeof data}`}>
        {JSON.stringify(data)}
      </span>
    );
  }

  const isArray = Array.isArray(data);
  const entries = isArray ? data : Object.keys(data);
  const isEmpty = isArray ? data.length === 0 : Object.keys(data).length === 0;

  if (isEmpty) {
    return <span className="json-empty">{isArray ? '[]' : '{}'}</span>;
  }

  return (
    <div className="json-tree">
      {isArray ? (
        data.map((item, idx) => (
          <ArrayItem
            key={idx}
            index={idx}
            value={item}
            path=""
            parentKey=""
            selectedFields={selectedFields}
            onFieldSelect={onFieldSelect}
            onFieldDeselect={onFieldDeselect}
          />
        ))
      ) : (
        Object.entries(data).map(([key, val]) => (
          <ObjectItem
            key={key}
            name={key}
            value={val}
            path={key}
            selectedFields={selectedFields}
            onFieldSelect={onFieldSelect}
            onFieldDeselect={onFieldDeselect}
          />
        ))
      )}
    </div>
  );
}

function ObjectItem({ name, value, path, selectedFields, onFieldSelect, onFieldDeselect, depth = 0 }) {
  const [expanded, setExpanded] = useState(true);
  const isSelected = selectedFields.has(path);

  if (value === null || value === undefined) {
    return (
      <div className="json-row">
        <span
          className={`json-leaf ${isSelected ? 'json-selected' : ''}`}
          onClick={() => isSelected ? onFieldDeselect?.(path) : onFieldSelect?.(path)}
        >
          <span className="json-key">{name}</span>: <span className="json-null">null</span>
        </span>
      </div>
    );
  }

  if (typeof value !== 'object') {
    return (
      <div className="json-row">
        <span
          className={`json-leaf ${isSelected ? 'json-selected' : ''}`}
          onClick={() => isSelected ? onFieldDeselect?.(path) : onFieldSelect?.(path)}
        >
          <span className="json-key">{name}</span>: <span className={`json-${typeof value}`}>{JSON.stringify(value)}</span>
        </span>
      </div>
    );
  }

  const isArray = Array.isArray(value);
  const entries = isArray ? value : Object.keys(value);
  const isEmpty = isArray ? value.length === 0 : Object.keys(value).length === 0;

  return (
    <div className="json-row">
      <span className="json-bracket">
        <span className="json-toggle-icon" onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}>{expanded ? '▼' : '▶'}</span>
        <span
          className={`json-key ${isSelected ? 'json-selected' : ''}`}
          onClick={() => isSelected ? onFieldDeselect?.(path) : onFieldSelect?.(path)}
        >{name}</span>:
        {isArray
          ? <span className="json-bracket-label"> [{value.length}]</span>
          : <span className="json-bracket-label"> {'{'}{Object.keys(value).length}{'}'}</span>
        }
      </span>
      {expanded && !isEmpty && (
        <div className="json-children">
          {isArray ? (
            value.map((item, idx) => (
              <ArrayItem
                key={idx}
                index={idx}
                value={item}
                path={path}
                parentKey={name}
                selectedFields={selectedFields}
                onFieldSelect={onFieldSelect}
                onFieldDeselect={onFieldDeselect}
                depth={depth + 1}
              />
            ))
          ) : (
            Object.entries(value).map(([key, val]) => (
              <ObjectItem
                key={key}
                name={key}
                value={val}
                path={`${path}.${key}`}
                selectedFields={selectedFields}
                onFieldSelect={onFieldSelect}
                onFieldDeselect={onFieldDeselect}
                depth={depth + 1}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ArrayItem({ index, value, path, parentKey, selectedFields, onFieldSelect, onFieldDeselect, depth = 0 }) {
  const [expanded, setExpanded] = useState(true);

  if (value === null || value === undefined) {
    return (
      <div className="json-row">
        <span
          className={`json-leaf`}
          onClick={() => setExpanded(!expanded)}
        >
          <span className="json-array-index">[{index}]</span>: <span className="json-null">null</span>
        </span>
      </div>
    );
  }

  if (typeof value !== 'object') {
    const isSelected = selectedFields.has(path || parentKey);
    return (
      <div className="json-row">
        <span
          className={`json-leaf ${isSelected ? 'json-selected' : ''}`}
          onClick={() => isSelected ? onFieldDeselect?.(path || parentKey) : onFieldSelect?.(path || parentKey)}
        >
          <span className="json-array-index">[{index}]</span>: <span className={`json-${typeof value}`}>{JSON.stringify(value)}</span>
        </span>
      </div>
    );
  }

  const isArray = Array.isArray(value);
  const isEmpty = isArray ? value.length === 0 : Object.keys(value).length === 0;

  return (
    <div className="json-row">
      <span className="json-bracket" onClick={() => setExpanded(!expanded)}>
        <span className="json-toggle-icon">{expanded ? '▼' : '▶'}</span>
        <span className="json-array-index">[{index}]</span>:
        {isArray
          ? <span className="json-bracket-label"> [{value.length}]</span>
          : <span className="json-bracket-label"> {'{'}{Object.keys(value).length}{'}'}</span>
        }
      </span>
      {expanded && !isEmpty && (
        <div className="json-children">
          {isArray ? (
            value.map((item, idx) => (
              <ArrayItem
                key={idx}
                index={idx}
                value={item}
                path={path}
                parentKey={parentKey}
                selectedFields={selectedFields}
                onFieldSelect={onFieldSelect}
                onFieldDeselect={onFieldDeselect}
                depth={depth + 1}
              />
            ))
          ) : (
            Object.entries(value).map(([key, val]) => (
              <ObjectItem
                key={key}
                name={key}
                value={val}
                path={path ? `${path}.${key}` : key}
                selectedFields={selectedFields}
                onFieldSelect={onFieldSelect}
                onFieldDeselect={onFieldDeselect}
                depth={depth + 1}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default JsonTree;
