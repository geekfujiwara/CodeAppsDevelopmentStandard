import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"

// Raw HTML in the text is treated as literal text: the agent's output is not trusted markup.
const components: Components = {
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0 leading-relaxed">{children}</p>,
  h1: ({ children }) => <h1 className="mb-2 mt-4 text-base font-semibold first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-2 mt-4 text-base font-semibold first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-2 mt-3 text-sm font-semibold first:mt-0">{children}</h3>,
  h4: ({ children }) => <h4 className="mb-2 mt-3 text-sm font-semibold first:mt-0">{children}</h4>,
  ul: ({ children }) => <ul className="my-2 ml-5 list-disc space-y-1 first:mt-0 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 ml-5 list-decimal space-y-1 first:mt-0 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 pl-3 text-muted-foreground">{children}</blockquote>
  ),
  hr: () => <hr className="my-3" />,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium underline underline-offset-2"
    >
      {children}
    </a>
  ),
  code: ({ className, children }) => {
    // react-markdown only sets a language class on fenced blocks, never on inline spans.
    const isBlock = typeof className === "string" && className.includes("language-")
    if (isBlock) {
      return <code className="font-mono text-[12px]">{children}</code>
    }
    return (
      <code className="rounded bg-muted px-1 py-0.5 font-mono text-[12px]">{children}</code>
    )
  },
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-md bg-muted p-3 first:mt-0 last:mb-0">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto first:mt-0 last:mb-0">
      <table className="w-full border-collapse text-left text-[13px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
  th: ({ children }) => (
    <th className="border px-2 py-1 font-medium whitespace-nowrap">{children}</th>
  ),
  td: ({ children }) => <td className="border px-2 py-1 align-top">{children}</td>,
}

export function Markdown({ children }: { children: string }) {
  return (
    <div className="min-w-0 break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
