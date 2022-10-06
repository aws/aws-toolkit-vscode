/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export const MynahEventNames = {
    CONTEXT_VISIBILITY_CHANGE: 'contextVisibilityChange',
    REMOVE_ALL_CONTEXT: 'removeAllContext',
}
export const MynahPortalNames = {
    WRAPPER: 'wrapper',
    OVERLAY: 'overlay',
    FEEDBACK_FORM: 'feedbackForm',
}
export interface SearchPayloadMatchPolicy {
    must: string[]
    should: string[]
    mustNot: string[]
}
export interface SearchPayloadCodeSelection {
    selectedCode: string
    file?: {
        range: {
            start: { row: string; column: string }
            end: { row: string; column: string }
        }
        name: string
    }
}
export interface SearchPayloadCodeQuery {
    simpleNames: string[]
    usedFullyQualifiedNames: string[]
}
export interface SearchPayload {
    query: string
    matchPolicy: SearchPayloadMatchPolicy
    codeSelection: SearchPayloadCodeSelection
    codeQuery?: SearchPayloadCodeQuery
}
export interface Suggestion {
    id: string
    title: string
    url: string
    body: string
    context: string[]
    type?: string
}
export enum KeyMap {
    ESCAPE = 'Escape',
    ENTER = 'Enter',
    BACKSPACE = 'Backspace',
    DELETE = 'Delete',
    ARROW_UP = 'ArrowUp',
    ARROW_DOWN = 'ArrowDown',
    ARROW_LEFT = 'ArrowLeft',
    ARROW_RIGHT = 'ArrowRight',
    PAGE_UP = 'PageUp',
    PAGED_OWN = 'PageDown',
    HOME = 'Home',
    END = 'End',
    META = 'Meta',
    TAB = 'Tab',
    SHIFT = 'Shift',
    CONTROL = 'Control',
    ALT = 'Alt',
}

export enum LiveSearchState {
    PAUSE = 'pauseLiveSearch',
    RESUME = 'resumeLiveSearch',
    STOP = 'stopLiveSearch',
}

export const SupportedCodingLanguages = ['typescript', 'javascript', 'java', 'json', 'python']
type ElementType<T extends readonly unknown[]> = T extends ReadonlyArray<infer ElementType> ? ElementType : never

export type SupportedCodingLanguagesType = ElementType<typeof SupportedCodingLanguages>
export const SupportedCodingLanguagesExtensionToTypeMap = {
    ts: 'typescript',
    js: 'javascript',
    py: 'python',
    java: 'java',
    json: 'json',
}

export type OnCopiedToClipboardFunction = (type?: 'selection' | 'block', text?: string) => void
export type OnCopiedToClipboardFunctionWithSuggestionId = (
    suggestionId: string,
    type?: 'selection' | 'block',
    text?: string
) => void
