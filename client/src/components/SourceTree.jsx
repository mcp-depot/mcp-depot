import { useDraggable } from '@dnd-kit/core';
import { ChevronRight, ChevronDown, GripVertical } from 'lucide-react';
import { useState } from 'react';

export function DraggableField({ path, label, type, data, stepId }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `field-${path}`,
    data: { path, label, type, data, stepId, source: 'response' }
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 1,
  } : {};

  const hasChildren = data && typeof data === 'object' && !Array.isArray(data);
  const isArray = Array.isArray(data);

  return (
    <div ref={setNodeRef} style={{ ...style, position: 'relative' }}>
      <div 
        style={{ 
          display: 'flex', 
          alignItems: 'center',
          padding: '4px 8px',
          marginLeft: '8px',
          borderRadius: '4px',
          cursor: isDragging ? 'grabbing' : 'grab',
          background: isDragging ? 'var(--primary)' : 'transparent',
          color: isDragging ? 'white' : 'var(--text)',
          fontSize: '0.85rem',
          gap: '4px',
          transition: 'background 0.15s'
        }}
        {...listeners}
        {...attributes}
      >
        <GripVertical size={12} style={{ opacity: 0.5, flexShrink: 0 }} />
        
        {hasChildren || isArray ? (
          <button 
            onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
            style={{ 
              background: 'none', 
              border: 'none', 
              padding: 0, 
              cursor: 'pointer',
              color: 'inherit',
              display: 'flex'
            }}
          >
            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : (
          <span style={{ width: '12px' }} />
        )}
        
        <span style={{ fontWeight: 500 }}>{label}</span>
        <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>
          {isArray ? `(${data.length} items)` : type || typeof data}
        </span>
      </div>
      
      {isExpanded && hasChildren && (
        <div style={{ marginLeft: '16px' }}>
          {Object.entries(data).map(([key, value]) => (
            <DraggableField 
              key={key}
              path={`${path}.${key}`}
              label={key}
              type={typeof value}
              data={value}
              stepId={stepId}
            />
          ))}
        </div>
      )}
      
      {isExpanded && isArray && (
        <div style={{ marginLeft: '16px' }}>
          {data.slice(0, 3).map((item, idx) => (
            <DraggableField 
              key={idx}
              path={`${path}[${idx}]`}
              label={`[${idx}]`}
              type={typeof item}
              data={item}
              stepId={stepId}
            />
          ))}
          {data.length > 3 && (
            <div style={{ padding: '4px 8px', color: 'var(--text-dim)', fontSize: '0.75rem' }}>
              ... and {data.length - 3} more items
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function SourceTree({ inputs = {}, stepResults = [], stepId }) {
  return (
    <div style={{ fontSize: '0.85rem' }}>
      <div style={{ marginBottom: '12px' }}>
        <div style={{ 
          fontSize: '0.7rem', 
          textTransform: 'uppercase', 
          color: 'var(--text-dim)', 
          marginBottom: '4px',
          letterSpacing: '0.05em'
        }}>
          Claude Inputs
        </div>
        {Object.keys(inputs).length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>No inputs defined</div>
        ) : (
          Object.entries(inputs).map(([key, schema]) => (
            <DraggableField 
              key={key}
              path={`inputs.${key}`}
              label={key}
              type={schema.type || 'string'}
              data={`{{inputs.${key}}}`}
              stepId="inputs"
            />
          ))
        )}
      </div>
      
      {stepResults.map((result, idx) => (
        <div key={result.id} style={{ marginBottom: '12px' }}>
          <div style={{ 
            fontSize: '0.7rem', 
            textTransform: 'uppercase', 
            color: 'var(--text-dim)', 
            marginBottom: '4px',
            letterSpacing: '0.05em'
          }}>
            Step {idx + 1}: {result.label}
          </div>
          
          {result.response ? (
            <>
              <DraggableField 
                path={`steps.${result.id}.response`}
                label="response (full)"
                type="object"
                data={result.response}
                stepId={result.id}
              />
              {result.extractions && Object.keys(result.extractions).length > 0 && (
                <>
                  <div style={{ 
                    fontSize: '0.7rem', 
                    textTransform: 'uppercase', 
                    color: 'var(--primary)', 
                    marginTop: '8px',
                    marginBottom: '4px'
                  }}>
                    Extracted Values
                  </div>
                  {Object.entries(result.extractions).map(([name, value]) => (
                    <DraggableField 
                      key={name}
                      path={`steps.${result.id}.extract.${name}`}
                      label={name}
                      type={typeof value}
                      data={value}
                      stepId={result.id}
                    />
                  ))}
                </>
              )}
            </>
          ) : (
            <div style={{ color: 'var(--text-dim)', fontStyle: 'italic', padding: '4px 8px' }}>
              No result yet
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function InputDropTarget({ paramKey, paramDef, onDrop, currentMapping }) {
  const [isOver, setIsOver] = useState(false);
  
  const { isOver: isDragOver, setNodeRef } = useDroppable({
    id: `input-${paramKey}`,
    data: { paramKey, paramDef }
  });

  return (
    <div
      ref={setNodeRef}
      onDragOver={(e) => { e.preventDefault(); setIsOver(true); }}
      onDragLeave={() => setIsOver(false)}
      onDrop={() => setIsOver(false)}
      style={{
        padding: '8px 12px',
        borderRadius: '6px',
        border: `2px dashed ${isDragOver ? 'var(--primary)' : 'var(--border)'}`,
        background: isDragOver ? 'var(--primary-bg)' : 'transparent',
        transition: 'all 0.15s',
        minHeight: '60px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{paramKey}</span>
        <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>{paramDef.type || 'string'}</span>
      </div>
      
      {currentMapping ? (
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '4px',
          fontSize: '0.8rem',
          color: 'var(--primary)'
        }}>
          <span>← {currentMapping.source === 'input' ? 'Claude Input' : 
                  currentMapping.source === 'step' ? `Step Response` : 
                  currentMapping.source === 'literal' ? 'Literal' : 'Expression'}:</span>
          <code style={{ background: 'var(--surface-hover)', padding: '2px 6px', borderRadius: '4px' }}>
            {currentMapping.key || currentMapping.value}
          </code>
        </div>
      ) : (
        <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', fontStyle: 'italic' }}>
          Drag a field here to map it
        </div>
      )}
    </div>
  );
}

import { useDroppable } from '@dnd-kit/core';
