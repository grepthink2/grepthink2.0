/// <reference types="vite/client" />

declare module '*.scss' {
  const classes: { [key: string]: string };
  export default classes;
}

declare module '*.svg?url' {
  const content: string;
  export default content;
}
