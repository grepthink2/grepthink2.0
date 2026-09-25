Three-column scrum board (TODO / In Progress / Done) with HTML5 drag & drop. Controlled: update status + the `moved` audit in `onMove`.

```jsx
const [tasks, setTasks] = useState(initial);
<ScrumBoard tasks={tasks} onOpenTask={open}
  onMove={(id, to) => setTasks(ts => ts.map(t => t.id === id
    ? {...t, status: to, moved: {to: label(to), by: currentUser, at: 'just now'}} : t))} />
```

Column headers show count + point sum; empty columns render a drop hint.
