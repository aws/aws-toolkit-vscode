/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as os from 'os'
import { DefaultCodeWhispererClient } from '../client/codewhisperer'
import * as CodeWhispererConstants from '../models/constants'
import { vsCodeState, ConfigurationEntry } from '../models/model'
import { getLogger } from '../../shared/logger'
import { InlineCompletion } from './inlineCompletion'
import { isCloud9 } from '../../shared/extensionUtilities'
import { RecommendationHandler } from './recommendationHandler'
import { CodewhispererAutomatedTriggerType, CodewhispererLanguage } from '../../shared/telemetry/telemetry'
import { getTabSizeSetting } from '../../shared/utilities/editorUtilities'
import { isInlineCompletionEnabled, normalizeOsName } from '../util/commonUtil'
import { InlineCompletionService } from './inlineCompletionService'
import { TelemetryHelper } from '../util/telemetryHelper'
import { AuthUtil } from '../util/authUtil'
import { extractContextForCodeWhisperer } from '../util/editorContext'
import { runtimeLanguageContext } from '../util/runtimeLanguageContext'

const performance = globalThis.performance ?? require('perf_hooks').performance

/**
 * This class is for CodeWhisperer auto trigger
 */
export class KeyStrokeHandler {
    /**
     * Speical character which automated triggers codewhisperer
     */
    public specialChar: string
    /**
     * Key stroke count for automated trigger
     */

    private idleTriggerTimer?: NodeJS.Timer

    public lastInvocationTime?: number

    public lastInvocationLineNumber?: number

    constructor() {
        this.specialChar = ''
    }

    static #instance: KeyStrokeHandler

    public static get instance() {
        return (this.#instance ??= new this())
    }

    public startIdleTimeTriggerTimer(
        event: vscode.TextDocumentChangeEvent,
        editor: vscode.TextEditor,
        client: DefaultCodeWhispererClient,
        config: ConfigurationEntry
    ) {
        if (this.idleTriggerTimer) {
            clearInterval(this.idleTriggerTimer)
            this.idleTriggerTimer = undefined
        }
        if (!this.shouldTriggerIdleTime()) {
            return
        }
        this.idleTriggerTimer = setInterval(() => {
            const duration = (performance.now() - RecommendationHandler.instance.lastInvocationTime) / 1000
            if (duration < CodeWhispererConstants.invocationTimeIntervalThreshold) {
                return
            }

            try {
                this.invokeAutomatedTrigger('IdleTime', editor, client, config)
            } finally {
                if (this.idleTriggerTimer) {
                    clearInterval(this.idleTriggerTimer)
                    this.idleTriggerTimer = undefined
                }
            }
        }, CodeWhispererConstants.idleTimerPollPeriod)
    }

    public shouldTriggerIdleTime(): boolean {
        if (isCloud9() && RecommendationHandler.instance.isGenerateRecommendationInProgress) {
            return false
        }
        if (isInlineCompletionEnabled() && InlineCompletionService.instance.isPaginationRunning()) {
            return false
        }
        if (InlineCompletion.instance.getIsActive || InlineCompletion.instance.isPaginationRunning()) {
            return false
        }
        return true
    }

    async processKeyStroke(
        event: vscode.TextDocumentChangeEvent,
        editor: vscode.TextEditor,
        client: DefaultCodeWhispererClient,
        config: ConfigurationEntry
    ): Promise<void> {
        try {
            if (!config.isAutomatedTriggerEnabled) {
                return
            }

            // Skip when output channel gains focus and invoke
            if (editor.document.languageId === 'Log') {
                return
            }

            // Pause automated trigger when typed input matches recommendation prefix for inline suggestion
            if (InlineCompletion.instance.isTypeaheadInProgress) {
                return
            }

            // Skip Cloud9 IntelliSense acceptance event
            if (
                isCloud9() &&
                event.contentChanges.length > 0 &&
                RecommendationHandler.instance.recommendations.length > 0
            ) {
                if (event.contentChanges[0].text === RecommendationHandler.instance.recommendations[0].content) {
                    return
                }
            }

            let triggerType: CodewhispererAutomatedTriggerType | undefined
            const changedSource = new DefaultDocumentChangedType(event.contentChanges).checkChangeSource()

            switch (changedSource) {
                case DocumentChangedSource.EnterKey: {
                    triggerType = 'Enter'
                    break
                }
                case DocumentChangedSource.SpecialCharsKey: {
                    triggerType = 'SpecialCharacters'
                    break
                }
                case DocumentChangedSource.IntelliSense: {
                    triggerType = 'IntelliSenseAcceptance'
                    break
                }
                case DocumentChangedSource.RegularKey: {
                    if (!['python', 'java'].includes(editor.document.languageId)) {
                        this.startIdleTimeTriggerTimer(event, editor, client, config)
                    }
                    break
                }
                default: {
                    break
                }
            }

            if (
                ['python', 'java'].includes(editor.document.languageId) &&
                [
                    DocumentChangedSource.EnterKey,
                    DocumentChangedSource.SpecialCharsKey,
                    DocumentChangedSource.IntelliSense,
                    DocumentChangedSource.RegularKey,
                ].includes(changedSource)
            ) {
                triggerType = this.checkFromClassifier(event, editor, triggerType) ? 'Classifier' : triggerType
            }

            if (triggerType) {
                this.invokeAutomatedTrigger(triggerType, editor, client, config)
            }
        } catch (error) {
            getLogger().error('Automated Trigger Exception : ', error)
            getLogger().verbose(`Automated Trigger Exception : ${error}`)
        }
    }

    checkFromClassifier(
        event: vscode.TextDocumentChangeEvent,
        editor: vscode.TextEditor,
        autoTriggerType: string | undefined
    ) {
        const fileContext = extractContextForCodeWhisperer(editor)
        const osPlatform = normalizeOsName(os.platform(), os.version())
        const char = event.contentChanges[0].text
        const lineNum = editor.selection.active.line
        const offSet = editor.selection.active.character
        const triggerThreshold = 0.4
        return getShouldTrigger(
            fileContext.leftFileContent,
            fileContext.rightFileContent,
            osPlatform,
            autoTriggerType,
            char,
            lineNum,
            offSet,
            triggerThreshold,
            runtimeLanguageContext.mapVscLanguageToCodeWhispererLanguage(editor.document.languageId)
        )
    }

    async invokeAutomatedTrigger(
        autoTriggerType: CodewhispererAutomatedTriggerType,
        editor: vscode.TextEditor,
        client: DefaultCodeWhispererClient,
        config: ConfigurationEntry
    ): Promise<void> {
        if (editor) {
            this.lastInvocationTime = performance.now()
            this.lastInvocationLineNumber = editor.selection.active.line
            if (isCloud9('any')) {
                if (RecommendationHandler.instance.isGenerateRecommendationInProgress) {
                    return
                }
                vsCodeState.isIntelliSenseActive = false
                RecommendationHandler.instance.isGenerateRecommendationInProgress = true
                try {
                    RecommendationHandler.instance.reportUserDecisionOfRecommendation(editor, -1)
                    RecommendationHandler.instance.clearRecommendations()
                    if (isCloud9('classic') || !AuthUtil.instance.isConnected()) {
                        await RecommendationHandler.instance.getRecommendations(
                            client,
                            editor,
                            'AutoTrigger',
                            config,
                            autoTriggerType,
                            false
                        )
                    } else {
                        if (AuthUtil.instance.isConnectionExpired()) {
                            await AuthUtil.instance.showReauthenticatePrompt()
                        }
                        await RecommendationHandler.instance.getRecommendations(
                            client,
                            editor,
                            'AutoTrigger',
                            config,
                            autoTriggerType,
                            true
                        )
                    }
                    if (RecommendationHandler.instance.canShowRecommendationInIntelliSense(editor, false)) {
                        await vscode.commands.executeCommand('editor.action.triggerSuggest').then(() => {
                            vsCodeState.isIntelliSenseActive = true
                        })
                    }
                } finally {
                    RecommendationHandler.instance.isGenerateRecommendationInProgress = false
                }
            } else if (isInlineCompletionEnabled()) {
                TelemetryHelper.instance.setInvokeSuggestionStartTime()
                await InlineCompletionService.instance.getPaginatedRecommendation(
                    client,
                    editor,
                    'AutoTrigger',
                    config,
                    autoTriggerType
                )
            } else {
                if (!vsCodeState.isCodeWhispererEditing && !InlineCompletion.instance.isPaginationRunning()) {
                    await InlineCompletion.instance.resetInlineStates(editor)
                    InlineCompletion.instance.getPaginatedRecommendation(
                        client,
                        editor,
                        'AutoTrigger',
                        config,
                        autoTriggerType
                    )
                }
            }
        }
    }
}

export abstract class DocumentChangedType {
    constructor(protected readonly contentChanges: ReadonlyArray<vscode.TextDocumentContentChangeEvent>) {
        this.contentChanges = contentChanges
    }

    abstract checkChangeSource(): DocumentChangedSource

    // Enter key should always start with ONE '\n' or '\r\n' and potentially following spaces due to IDE reformat
    protected isEnterKey(str: string): boolean {
        if (str.length === 0) {
            return false
        }
        return (
            (str.startsWith('\r\n') && str.substring(2).trim() === '') ||
            (str[0] === '\n' && str.substring(1).trim() === '')
        )
    }

    // Tab should consist of space char only ' ' and the length % tabSize should be 0
    protected isTabKey(str: string): boolean {
        const tabSize = getTabSizeSetting()
        if (str.length % tabSize === 0 && str.trim() === '') {
            return true
        }
        return false
    }

    protected isUserTypingSpecialChar(str: string): boolean {
        return ['(', '()', '[', '[]', '{', '{}', ':'].includes(str)
    }

    protected isSingleLine(str: string): boolean {
        let newLineCounts = 0
        for (const ch of str) {
            if (ch === '\n') {
                newLineCounts += 1
            }
        }

        // since pressing Enter key possibly will generate string like '\n        ' due to indention
        if (this.isEnterKey(str)) {
            return true
        }
        if (newLineCounts >= 1) {
            return false
        }
        return true
    }
}

export class DefaultDocumentChangedType extends DocumentChangedType {
    constructor(contentChanges: ReadonlyArray<vscode.TextDocumentContentChangeEvent>) {
        super(contentChanges)
    }

    checkChangeSource(): DocumentChangedSource {
        if (this.contentChanges.length === 0) {
            return DocumentChangedSource.Unknown
        }

        // event.contentChanges.length will be 2 when user press Enter key multiple times
        if (this.contentChanges.length > 2) {
            return DocumentChangedSource.Reformatting
        }

        // Case when event.contentChanges.length === 1
        const changedText = this.contentChanges[0].text

        if (this.isSingleLine(changedText)) {
            if (changedText === '') {
                return DocumentChangedSource.Deletion
            } else if (this.isEnterKey(changedText)) {
                return DocumentChangedSource.EnterKey
            } else if (this.isTabKey(changedText)) {
                return DocumentChangedSource.TabKey
            } else if (this.isUserTypingSpecialChar(changedText)) {
                return DocumentChangedSource.SpecialCharsKey
            } else if (changedText.length === 1) {
                return DocumentChangedSource.RegularKey
            } else if (new RegExp('^[ ]+$').test(changedText)) {
                // single line && single place reformat should consist of space chars only
                return DocumentChangedSource.Reformatting
            } else if (new RegExp('^[\\S]+$').test(changedText) && !isCloud9()) {
                // match single word only, which is general case for intellisense suggestion, it's still possible intllisense suggest
                // multi-words code snippets
                return DocumentChangedSource.IntelliSense
            } else {
                return isCloud9() ? DocumentChangedSource.RegularKey : DocumentChangedSource.Unknown
            }
        }

        // Won't trigger cwspr on multi-line changes
        return DocumentChangedSource.Unknown
    }
}

export enum DocumentChangedSource {
    SpecialCharsKey = 'SpecialCharsKey',
    RegularKey = 'RegularKey',
    TabKey = 'TabKey',
    EnterKey = 'EnterKey',
    IntelliSense = 'IntelliSense',
    Reformatting = 'Reformatting',
    Deletion = 'Deletion',
    Unknown = 'Unknown',
}

// os coefficient
const osMap: Record<string, number> = {
    'Mac OS X': 0.1168,
    win32: 0.0973,
    'Windows 10': 0.3181,
    'Windows 7': 0.2702,
}

// trigger type coefficient
const triggerTypeCoefficientMap: Record<string, number> = {
    SpecialCharacters: -0.1402,
    Enter: 0.1915,
}

const languageMap: Record<string, number> = {
    python: 0.1376,
}

// other metadata coefficient
const lineNumCoefficient = 0.5011

const cursorOffsetCoefficient = -0.2242

// length of the current line of left_context
const lengthOfLeftCurrentCoefficient = -0.989

// length of the previous line of left context
const lengthOfLeftPrevCoefficient = 0.4184

// lenght of right_context
const lengthofRightCoefficient = -0.5168

const lineDiffCoefficient = 0.0546

const prevDecisionAcceptCoefficient = 1.3668

const prevDecisionRejectCoefficient = -0.0017

const prevDecisionOtherCoefficient = 0.1409

const ideVscode = -0.0513

// intercept of logistic regression classifier
const intercept = -0.44590798

interface normalizedCoefficients {
    cursor: number
    lineNum: number
    lenLeftCur: number
    lenLeftPrev: number
    lenRight: number
    lineDiff: number
    timeDiff: number
}

const maxx: normalizedCoefficients = {
    cursor: 88911.0,
    lineNum: 1997.0,
    lenLeftCur: 164.0,
    lenLeftPrev: 160.0,
    lenRight: 10239.0,
    lineDiff: 349.0,
    timeDiff: 268602852.0,
}

const minn: normalizedCoefficients = {
    cursor: 0.0,
    lineNum: 0.0,
    lenLeftCur: 0.0,
    lenLeftPrev: 0.0,
    lenRight: 0.0,
    lineDiff: -32222.0,
    timeDiff: 0.0,
}

export const getShouldTrigger = (
    leftContext: string,
    rightContext: string,
    os: string,
    triggerType: string | undefined,
    char: string,
    lineNum: number,
    cursorOffset: number,
    triggerThreshold: number,
    language: CodewhispererLanguage | undefined
) => {
    if (!language) {
        return false
    }

    const leftContextLines = leftContext.split(/\r?\n/)
    const leftContextAtCurrentLine = leftContextLines[leftContextLines.length - 1]
    const tokens = leftContextAtCurrentLine.trim().split(' ')
    const keyword = tokens[tokens.length - 1]
    const lengthOfLeftCurrent = leftContextLines[leftContextLines.length - 1].length
    const lengthOfLeftPrev = leftContextLines[leftContextLines.length - 2]?.length ?? 0
    const lengthofRight = rightContext.trim().length
    const triggerTypeCoefficient = triggerTypeCoefficientMap[triggerType || ''] ?? 0
    const osCoefficient = osMap[os] ?? 0
    const charCoefficient = coefficients[char] ?? 0
    const keyWordCoefficient = coefficients[keyword] ?? 0
    const languageCoefficient = languageMap[language] ?? 0

    const prevoiusOneDecision = TelemetryHelper.instance.decisionQueue.mostRecentDecision()

    const previousOneAccept = prevoiusOneDecision === 'Accept' ? prevDecisionAcceptCoefficient : 0
    const previousOneReject = prevoiusOneDecision === 'Reject' ? prevDecisionRejectCoefficient : 0
    const previousOneOther =
        prevoiusOneDecision === 'Discard' ||
        prevoiusOneDecision === 'Empty' ||
        prevoiusOneDecision === 'Ignore' ||
        prevoiusOneDecision === 'Unseen' ||
        prevoiusOneDecision === 'Filter'
            ? prevDecisionOtherCoefficient
            : 0

    const lineDiff = KeyStrokeHandler.instance.lastInvocationLineNumber
        ? lineNum - KeyStrokeHandler.instance.lastInvocationLineNumber
        : 0

    const ideCoefficient = ideVscode

    const result =
        (lengthofRightCoefficient * (lengthofRight - minn.lenRight)) / (maxx.lenRight - minn.lenRight) +
        (lengthOfLeftCurrentCoefficient * (lengthOfLeftCurrent - minn.lenLeftCur)) /
            (maxx.lenLeftCur - minn.lenLeftCur) +
        (lengthOfLeftPrevCoefficient * (lengthOfLeftPrev - minn.lenLeftPrev)) / (maxx.lenLeftPrev - minn.lenLeftPrev) +
        (lineNumCoefficient * (lineNum - minn.lineNum)) / (maxx.lineNum - minn.lineNum) +
        (cursorOffsetCoefficient * (cursorOffset - minn.cursor)) / (maxx.cursor - minn.cursor) +
        (lineDiffCoefficient * (lineDiff - minn.lineDiff)) / (maxx.lineDiff - minn.lineDiff) +
        languageCoefficient +
        osCoefficient +
        triggerTypeCoefficient +
        charCoefficient +
        keyWordCoefficient +
        ideCoefficient +
        intercept +
        previousOneAccept +
        previousOneReject +
        previousOneOther

    const shouldTrigger = sigmoid(result) > triggerThreshold
    return shouldTrigger
}

const sigmoid = (x: number) => {
    return 1 / (1 + Math.exp(-x))
}

const coefficients: Record<string, number> = {
    '#': -2.029,
    '\\': -1.8354,
    '8': -1.7039,
    '6': -1.5019,
    '*': -1.3513,
    '7': -1.3149,
    '5': -1.1897,
    '0': -1.1892,
    '/': -1.1556,
    throw: 1.0807,
    break: -1.076,
    Z: -1.0552,
    ']': -1.0037,
    '1': -0.9934,
    continue: -0.966,
    protected: -0.9652,
    '`': -0.9439,
    ';': -0.9193,
    '@': -0.9031,
    $: -0.8492,
    lambda: 0.8379,
    '9': -0.8106,
    '~': -0.7694,
    '}': -0.7169,
    '4': -0.6625,
    '2': -0.6617,
    elif: 0.643,
    P: -0.6421,
    '-': -0.6402,
    raise: 0.633,
    else: -0.5776,
    '%': -0.5776,
    except: 0.5733,
    ')': -0.5302,
    '+': -0.5119,
    async: 0.4974,
    void: 0.4922,
    final: -0.491,
    '(': 0.4842,
    z: -0.4791,
    '>': -0.46,
    case: 0.4481,
    def: 0.4392,
    if: 0.4326,
    D: -0.4288,
    V: -0.4142,
    '3': -0.4089,
    j: -0.3884,
    U: -0.3768,
    as: 0.3754,
    catch: -0.3736,
    '^': -0.3706,
    N: -0.3677,
    "'": -0.3661,
    S: -0.3615,
    from: -0.3608,
    '?': -0.3582,
    p: -0.3573,
    X: -0.3521,
    '&': -0.3459,
    '"': -0.3403,
    ':': 0.3375,
    private: -0.3331,
    I: -0.3305,
    '.': -0.3216,
    for: 0.3081,
    try: -0.3079,
    '|': -0.288,
    '{': 0.2848,
    static: -0.2829,
    abstract: -0.2815,
    d: -0.2793,
    public: -0.2789,
    a: -0.278,
    k: -0.2715,
    pass: -0.2622,
    h: -0.261,
    '<': -0.254,
    s: -0.2508,
    v: -0.2501,
    T: -0.2482,
    boolean: -0.245,
    None: 0.2415,
    c: -0.2401,
    nonlocal: -0.2363,
    f: -0.2333,
    long: -0.2267,
    new: 0.2254,
    O: -0.2207,
    W: -0.215,
    default: 0.2082,
    _: -0.2056,
    K: -0.2038,
    Y: -0.2029,
    '=': -0.1995,
    B: 0.1966,
    R: -0.1958,
    or: 0.1914,
    n: -0.1914,
    char: 0.1911,
    await: -0.1903,
    byte: -0.1868,
    M: -0.1858,
    C: -0.185,
    and: -0.1817,
    o: -0.1807,
    extends: 0.1807,
    int: 0.1771,
    synchronized: 0.175,
    m: -0.1742,
    False: -0.1713,
    this: 0.1699,
    E: -0.1688,
    while: -0.1679,
    return: 0.1674,
    w: -0.1671,
    Q: 0.1614,
    A: -0.1526,
    G: -0.1466,
    implements: 0.1439,
    transient: -0.1426,
    b: -0.1418,
    l: -0.1321,
    H: 0.1313,
    ',': -0.1255,
    native: -0.1252,
    F: -0.1185,
    t: -0.1172,
    import: -0.112,
    x: 0.1078,
    L: -0.105,
    e: -0.1015,
    do: 0.0916,
    assert: 0.091,
    instanceof: -0.0894,
    g: -0.089,
    yield: 0.089,
    with: 0.0888,
    throws: 0.0869,
    global: -0.0811,
    float: 0.0791,
    class: -0.077,
    super: 0.0767,
    y: -0.0714,
    interface: 0.0675,
    enum: -0.0621,
    package: -0.0602,
    not: 0.0594,
    i: -0.0569,
    del: 0.0516,
    '[': -0.0511,
    True: -0.0499,
    double: -0.0479,
    in: -0.0476,
    is: -0.0254,
    J: 0.017,
    q: -0.0103,
    r: -0.0029,
    u: 0.0015,
    const: 0.0,
    short: 0.0,
    volatile: 0.0,
    switch: 0.0,
    goto: 0.0,
    finally: 0.0,
    strictfp: 0.0,
}
