import { createContext, useContext } from "react";
import { VIDEO, layout } from "../theme/tokens";

/** Height (px) of the content area between the header and the subtitle band. */
export const contentHeight = (showHeader: boolean) =>
  VIDEO.height - (showHeader ? layout.headerHeight : 0) - layout.subtitleBandHeight;

/** The current scene's content area height; screens size themselves to it. */
export const ContentHeightContext = createContext(contentHeight(true));

export const useContentHeight = () => useContext(ContentHeightContext);
