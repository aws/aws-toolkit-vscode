// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonq.webview.theme

/**
 * Enumeration of CSS variables that used by MynahUi to theme the chat experience.
 */
enum class CssVariable(
    val varName: String
) {
    FontSize("--vscode-font-size"),
    FontFamily("--mynah-font-family"),

    TextColorDefault("--mynah-color-text-default"),
    TextColorStrong("--mynah-color-text-strong"),
    TextColorWeak("--mynah-color-text-weak"),
    TextColorLink("--mynah-color-text-link"),
    TextColorInput("--mynah-color-text-input"),

    Background("--mynah-color-bg"),
    BackgroundAlt("--mynah-color-bg-alt"),
    TabActive("--mynah-color-tab-active"),

    ColorDeep("--mynah-color-deep"),
    ColorDeepReverse("--mynah-color-deep-reverse"),
    BorderDefault("--mynah-color-border-default"),
    InputBackground("--mynah-color-input-bg"),

    SyntaxBackground("--mynah-color-syntax-bg"),
    SyntaxVariable("--mynah-color-syntax-variable"),
    SyntaxFunction("--mynah-color-syntax-function"),
    SyntaxOperator("--mynah-color-syntax-operator"),
    SyntaxAttributeValue("--mynah-color-syntax-attr-value"),
    SyntaxAttribute("--mynah-color-syntax-attr"),
    SyntaxProperty("--mynah-color-syntax-property"),
    SyntaxComment("--mynah-color-syntax-comment"),
    SyntaxCode("--mynah-color-syntax-code"),
    SyntaxCodeFontFamily("--mynah-syntax-code-font-family"),
    SyntaxCodeFontSize("--mynah-syntax-code-font-size"),

    StatusInfo("--mynah-color-status-info"),
    StatusSuccess("--mynah-color-status-success"),
    StatusWarning("--mynah-color-status-warning"),
    StatusError("--mynah-color-status-error"),

    ButtonBackground("--mynah-color-button"),
    ButtonForeground("--mynah-color-button-reverse"),

    SecondaryButtonBackground("--mynah-color-alternate"),
    SecondaryButtonForeground("--mynah-color-alternate-reverse"),

    CodeText("--mynah-color-code-text"),

    MainBackground("--mynah-color-main"),
    MainForeground("--mynah-color-main-reverse"),

    CardBackground("--mynah-card-bg")
}
