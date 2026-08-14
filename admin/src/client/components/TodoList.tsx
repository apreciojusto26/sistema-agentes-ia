// Renders GenerateResult.todos verbatim (design §4: the contract test welds
// this array to the exact "TODO before this landing is production-ready:"
// block generate-landing.mjs prints to stdout — no paraphrasing here either).
export type TodoListProps = {
  todos: string[];
};

export default function TodoList({ todos }: TodoListProps) {
  if (todos.length === 0) return null;

  return (
    <div className="rounded border border-amber-300 bg-amber-50 p-3">
      <p className="text-xs font-semibold text-amber-800">Antes de publicar esta landing, revisá:</p>
      <ul className="mt-1 list-inside list-disc text-xs text-amber-800">
        {todos.map((todo) => (
          <li key={todo}>{todo}</li>
        ))}
      </ul>
    </div>
  );
}
