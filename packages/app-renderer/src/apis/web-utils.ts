const WebUtils: Window["webUtils"] = window.webUtils;

export const webUtils = {
  getPathForFile: (file: File) => WebUtils.getPathForFile(file),
};
