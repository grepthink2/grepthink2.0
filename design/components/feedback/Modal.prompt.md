Modal dialog with blurred scrim, 12px-radius white sheet and absolute × (mirrors JoinClassModal). Esc + backdrop close.

```jsx
<Modal open={open} onClose={close} title="Join a Class" subtitle="Enter the 6-digit code from your instructor"
  footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button>Join</Button></>}>
  …
</Modal>
```
