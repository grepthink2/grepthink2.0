/** Passed from AppView via <Outlet context={...} /> for nested routes. */
export type AppOutletContext = {
  openJoinClassModal: () => void;
  /**
   * The read-only preview is on (usePreview). A lazy page reads it here when importing previewContext
   * itself would split that module out of the entry chunk into one more file every visitor loads
   * (the document page does).
   */
  isPreviewing: boolean;
};
