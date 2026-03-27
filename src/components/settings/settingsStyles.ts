import { StyleSheet } from "react-native";
import { appFontFamily, theme } from "../../theme";
import { screenChrome } from "../../theme/screenChrome";
import { compactActionTokens } from "../buttonSystem";

export const settingsStyles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: screenChrome.TITLE_CONTENT_TOP_PADDING,
    paddingBottom: screenChrome.FOOTER_PADDING_BOTTOM + 24,
    alignSelf: "center",
    width: "100%",
    maxWidth: theme.layout.contentMaxWidth,
  },
  sectionBlock: {
    marginBottom: 14,
  },
  sectionLabel: {
    marginLeft: 2,
    marginBottom: 6,
    fontWeight: theme.fontWeight.semibold,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  sectionCard: {
    borderRadius: 16,
    paddingHorizontal: 0,
    paddingVertical: 0,
    overflow: "hidden",
  },
  divider: {
    height: 1,
    marginLeft: 48,
  },
  settingShell: {
    paddingHorizontal: 12,
    paddingVertical: 13,
  },
  settingShellRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  settingIconBox: {
    width: 28,
    alignItems: "center",
    paddingTop: 2,
  },
  settingContent: {
    flex: 1,
    gap: 8,
  },
  settingTitleLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  settingTitle: {
    fontWeight: theme.fontWeight.semibold,
  },
  settingDescription: {
    lineHeight: 17,
  },
  choiceGroup: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },
  choiceGroupVertical: {
    flexDirection: "column",
  },
  choicePressable: {
    flex: 1,
  },
  choicePressableFull: {
    flex: undefined,
    width: "100%",
  },
  choiceChip: {
    minHeight: compactActionTokens.minHeight,
    borderRadius: compactActionTokens.borderRadius,
    borderWidth: compactActionTokens.borderWidth,
    paddingHorizontal: compactActionTokens.paddingHorizontal,
    alignItems: "center",
    justifyContent: "center",
  },
  choiceChipFull: {
    width: "100%",
  },
  choiceChipLabel: {
    fontFamily: appFontFamily.semibold,
    fontSize: compactActionTokens.labelFontSize,
    lineHeight: compactActionTokens.labelLineHeight,
    textAlign: "center",
  },
  toggleTrack: {
    width: 48,
    height: 28,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: "center",
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    shadowColor: theme.colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 4,
  },
  toggleDisabledPressable: {
    opacity: 0.88,
  },
  toggleDisabled: {
    opacity: 0.72,
  },
  innerToggleCard: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: "hidden",
  },
  toggleRow: {
    minHeight: 56,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  toggleTextWrap: {
    flex: 1,
    gap: 6,
  },
  toggleTitleLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  toggleTitle: {
    fontWeight: theme.fontWeight.semibold,
  },
  toggleTrailing: {
    minWidth: 80,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8,
  },
  lockedBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  lockedBadgeText: {
    fontSize: theme.fontSize.xs,
    fontFamily: appFontFamily.semibold,
  },
  actionRow: {
    minHeight: 60,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  actionRowPressed: {
    opacity: 0.72,
  },
  actionRowDisabled: {
    opacity: 0.6,
  },
  actionTextWrap: {
    flex: 1,
    gap: 4,
  },
  actionTitle: {
    fontWeight: theme.fontWeight.semibold,
  },
  actionDescription: {
    lineHeight: 18,
  },
  actionTrailing: {
    minWidth: 72,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  actionRightText: {
    fontFamily: appFontFamily.medium,
  },
  e2eCard: {
    marginTop: 2,
    marginBottom: 18,
  },
  e2eLabel: {
    marginLeft: 0,
  },
  e2eStack: {
    gap: 10,
  },
});
