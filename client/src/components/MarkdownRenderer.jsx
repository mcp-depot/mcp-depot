import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function MarkdownRenderer({ content, style }) {
  return (
    <div className="md-body" style={style}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="md-h1">{children}</h1>,
          h2: ({ children }) => <h2 className="md-h2">{children}</h2>,
          h3: ({ children }) => <h3 className="md-h3">{children}</h3>,
          h4: ({ children }) => <h4 className="md-h4">{children}</h4>,
          p:  ({ children }) => <p  className="md-p">{children}</p>,
          strong: ({ children }) => <strong className="md-strong">{children}</strong>,
          em:     ({ children }) => <em className="md-em">{children}</em>,
          code: ({ children, className: cls }) => {
            const isBlock = cls?.includes('language-');
            return isBlock
              ? <code className="md-code-block">{children}</code>
              : <code className="md-code-inline">{children}</code>;
          },
          pre: ({ children }) => <>{children}</>,
          ul: ({ children }) => <ul className="md-ul">{children}</ul>,
          ol: ({ children }) => <ol className="md-ol">{children}</ol>,
          li: ({ children }) => <li className="md-li">{children}</li>,
          blockquote: ({ children }) => <blockquote className="md-blockquote">{children}</blockquote>,
          hr: () => <hr className="md-hr" />,
          a:  ({ children, href }) => (
            <a className="md-link" href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          table:  ({ children }) => <div className="md-table-wrap"><table className="md-table">{children}</table></div>,
          thead:  ({ children }) => <thead className="md-thead">{children}</thead>,
          tbody:  ({ children }) => <tbody>{children}</tbody>,
          tr:     ({ children }) => <tr className="md-tr">{children}</tr>,
          th:     ({ children }) => <th className="md-th">{children}</th>,
          td:     ({ children }) => <td className="md-td">{children}</td>,
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}