/**
 * Ce que chaque vue répète pour porter la pile : la pile elle-même, l'état
 * de liste du niveau courant, le droit de sauter, et la phrase au modèle
 * en repli. Une vue ne garde que son niveau 1.
 */

import type { App } from "@modelcontextprotocol/ext-apps";
import { useCallback } from "preact/hooks";
import type { DoclistData } from "./doclist/types";
import { useDoclist } from "./doclist/useDoclist";
import { canJump } from "./jumps";
import { levelListData } from "./levels/LevelBody";
import { canSendTextMessage, sendTextMessage } from "./host-message";
import type { LevelInit } from "./nav-stack";
import { useNavStack } from "./useNavStack";

export function useViewerNav(
  app: App,
  root: LevelInit,
  { fixture = false, rootList }: {
    fixture?: boolean;
    /** Une vue dont le niveau 1 est lui-même une liste (doclist) la donne ici. */
    rootList?: DoclistData;
  } = {},
) {
  const nav = useNavStack(app, root);
  const { current, isRoot } = nav;
  // La fixture ne contacte jamais l'hôte ; chaque canal suit sa capacité propre.
  const jumpsEnabled = !fixture && canJump(app.getHostCapabilities());
  const messagesEnabled = !fixture &&
    canSendTextMessage(app.getHostCapabilities());
  // Déclaré inconditionnellement : à la racine il porte une liste vide.
  const list = useDoclist(
    isRoot && rootList ? rootList : levelListData(current),
    current.ui,
    nav.patchUi,
  );
  const sendAsk = useCallback((message: string) => {
    return sendTextMessage(app, message);
  }, [app]);
  const ask = messagesEnabled ? sendAsk : undefined;
  return {
    nav,
    current,
    isRoot,
    jumpsEnabled,
    messagesEnabled,
    list,
    ask,
  };
}

export type ViewerNav = ReturnType<typeof useViewerNav>;
