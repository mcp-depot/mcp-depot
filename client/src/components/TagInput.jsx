import { useState } from 'react';

export function TagInput({ tags = [], onChange, placeholder = 'Add tag and press Enter' }) {
  const [input, setInput] = useState('');

  const addTag = (e) => {
    if (e.key === 'Enter' && input.trim()) {
      e.preventDefault();
      if (!tags.includes(input.trim())) {
        onChange([...tags, input.trim()]);
      }
      setInput('');
    }
  };

  const removeTag = (tag) => {
    onChange(tags.filter(t => t !== tag));
  };

  return (
    <div className="tag-input" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', border: '1px solid #d1d5db', borderRadius: '0.375rem', padding: '0.5rem', minHeight: '2.5rem' }}>
      {tags.map(tag => (
        <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.125rem 0.5rem', background: '#e5e7eb', borderRadius: '9999px', fontSize: '0.875rem' }}>
          {tag}
          <button type="button" onClick={() => removeTag(tag)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0', color: '#6b7280', fontSize: '1rem', lineHeight: '1' }}>&times;</button>
        </span>
      ))}
      <input
        type="text"
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={addTag}
        placeholder={placeholder}
        style={{ border: 'none', outline: 'none', flex: '1', minWidth: '120px', fontSize: '0.875rem', padding: '0.25rem 0' }}
      />
    </div>
  );
}

export default TagInput;
