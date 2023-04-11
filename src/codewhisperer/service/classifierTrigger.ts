/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as os from 'os'
import * as vscode from 'vscode'
import globals from '../../shared/extensionGlobals'
import { CodewhispererLanguage, CodewhispererAutomatedTriggerType } from '../../shared/telemetry/telemetry'
import { extractContextForCodeWhisperer } from '../util/editorContext'
import { TelemetryHelper } from '../util/telemetryHelper'
import * as CodeWhispererConstants from '../models/constants'
import { runtimeLanguageContext } from '../util/runtimeLanguageContext'

interface normalizedCoefficients {
    readonly cursor: number
    readonly lineNum: number
    readonly lenLeftCur: number
    readonly lenLeftPrev: number
    readonly lenRight: number
    readonly lineDiff: number
}
/*
 uses ML classifier to determine if user input should trigger CWSPR service
 */
export class ClassifierTrigger {
    static #instance: ClassifierTrigger

    public static get instance() {
        return (this.#instance ??= new this())
    }

    private lastInvocationLineNumber: number = 0

    private supportedLanguage: CodewhispererLanguage[] = ['java']

    // ML classifier trigger threshold
    private triggerThreshold = 0.4

    // ML classifier coefficients
    // os coefficient
    private osCoefficientMap: Readonly<Record<string, number>> = {
        'Mac OS X': 0.102638,
        win32: 0.040345,
        'Windows 10': 0.28953,
        'Windows 7': 0.086803,
    }
    // trigger type coefficient
    private triggerTypeCoefficientMap: Readonly<Record<string, number>> = {
        SpecialCharacters: 0.017268,
        Enter: 0.117394,
    }

    // other metadata coefficient
    private lineNumCoefficient = 0.695076
    private cursorOffsetCoefficient = -0.43856
    private lengthOfLeftCurrentCoefficient = -1.074552
    private lengthOfLeftPrevCoefficient = 0.415858
    private lengthofRightCoefficient = -0.500256
    private lineDiffCoefficient = 1.227713
    private prevDecisionAcceptCoefficient = 1.362196
    private prevDecisionRejectCoefficient = -0.047703
    private prevDecisionOtherCoefficient = 0.143317
    private ideVscode = -0.114251

    // intercept of logistic regression classifier
    private intercept = -0.44590798

    private maxx: normalizedCoefficients = {
        cursor: 90716.0,
        lineNum: 2085.0,
        lenLeftCur: 166.0,
        lenLeftPrev: 161.0,
        lenRight: 10239.0,
        lineDiff: 349.0,
    }

    private minn: normalizedCoefficients = {
        cursor: 1.0,
        lineNum: 0.0,
        lenLeftCur: 0.0,
        lenLeftPrev: 0.0,
        lenRight: 0.0,
        lineDiff: -5157.0,
    }
    // character and keywords coefficient
    private charCoefficient: Readonly<Record<string, number>> = {
        False: -0.083505,
        None: 0.306,
        True: -0.057586,
        abstract: -0.127709,
        and: 0.196992,
        as: 0.093336,
        assert: 0.181738,
        async: 0.597813,
        await: -0.238037,
        boolean: -0.134727,
        break: -1.033123,
        byte: 0.02461,
        case: 0.362508,
        catch: -0.453977,
        char: 0.049842,
        class: 0.002792,
        const: 0.0,
        continue: -0.903924,
        def: 0.715946,
        default: 0.09979,
        del: 0.14807,
        do: -0.195257,
        double: 0.014083,
        elif: 1.188137,
        else: -0.479359,
        enum: 0.150915,
        except: 1.064073,
        extends: -0.079624,
        final: -0.845024,
        finally: -0.198092,
        float: 0.533561,
        for: 0.225931,
        from: -0.256604,
        global: -0.082052,
        goto: 0.0,
        if: 0.417686,
        implements: -0.033625,
        import: -0.193438,
        in: 0.095462,
        instanceof: 0.181306,
        int: -0.45144,
        interface: 0.135839,
        is: 0.312377,
        lambda: 0.997797,
        long: -0.482117,
        native: -0.108527,
        new: 0.380958,
        nonlocal: 0.0,
        not: 0.139249,
        or: 0.024189,
        package: -0.128968,
        pass: -0.422767,
        private: -0.400126,
        protected: -0.749059,
        public: -0.290176,
        raise: 0.98372,
        return: 0.26258,
        short: 0.0,
        static: -0.422215,
        strictfp: 0.0,
        super: -0.061203,
        switch: 0.0,
        synchronized: 0.058414,
        this: -0.27418,
        throw: 0.380921,
        throws: 0.032822,
        transient: -0.100722,
        try: -0.726115,
        void: 0.147821,
        volatile: 0.0,
        while: -0.158144,
        with: 0.400751,
        yield: 0.275915,
        '"': -0.162722,
        '!': -0.99026,
        '': -0.471628,
        '#': -1.810876,
        $: -0.452123,
        '%': -0.329621,
        '&': -0.279653,
        "'": -0.443367,
        '(': 0.184168,
        ')': -0.718342,
        '*': -1.489626,
        '+': -0.736006,
        ',': -0.342575,
        '-': -0.950035,
        '.': -0.540129,
        '/': -1.395258,
        '0': -1.457238,
        '1': -1.094267,
        '2': -1.011995,
        '3': -0.583036,
        '4': -1.037645,
        '5': -1.633417,
        '6': -1.868711,
        '7': -1.643608,
        '8': -2.052011,
        '9': -1.28873,
        ':': 0.062965,
        ';': -1.101242,
        '<': -0.451429,
        '=': -0.376955,
        '>': -0.504938,
        '?': -0.694492,
        '@': -1.294691,
        A: -0.333319,
        B: -0.070534,
        C: -0.29784,
        D: -0.816886,
        E: -0.350734,
        F: -0.389955,
        G: -0.367616,
        H: -0.628719,
        I: -0.444782,
        J: 0.415714,
        K: -0.704028,
        L: -0.397781,
        M: -0.366598,
        N: -0.643249,
        O: -0.525682,
        P: -0.627397,
        Q: -0.511114,
        R: -0.564166,
        S: -0.523443,
        T: -0.441952,
        U: -0.622641,
        V: -0.647597,
        W: 0.046767,
        X: -0.198077,
        Y: -0.580768,
        Z: -0.900616,
        '[': -0.387163,
        '\\': -1.954455,
        ']': -1.028313,
        '^': -0.44017,
        _: -0.409321,
        '`': -1.264675,
        a: -0.351206,
        b: -0.267324,
        c: -0.357747,
        d: -0.404917,
        e: -0.26934,
        f: -0.335575,
        g: -0.188718,
        h: -0.326342,
        i: -0.225867,
        j: -0.653398,
        k: -0.316385,
        l: -0.345242,
        m: -0.266107,
        n: -0.331833,
        o: -0.34594,
        p: -0.466481,
        q: -0.606473,
        r: -0.220341,
        s: -0.42861,
        t: -0.271349,
        u: -0.128044,
        v: -0.415449,
        w: -0.37644,
        x: -0.208712,
        y: -0.324526,
        z: -0.850803,
        '{': -0.048079,
        '|': -0.388645,
        '}': -0.827595,
        '~': -0.641978,
    }

    public setLastInvocationLineNumber(lineNumber: number) {
        this.lastInvocationLineNumber = lineNumber
    }

    public isClassifierEnabled() {
        return globals.context.globalState.get<boolean>(CodeWhispererConstants.isClassifierEnabledKey)
    }

    public recordClassifierResultForManualTrigger(editor: vscode.TextEditor) {
        const isClassifierSupportedLanguage = this.isSupportedLanguage(
            runtimeLanguageContext.mapVscLanguageToCodeWhispererLanguage(editor.document.languageId)
        )
        if (this.isClassifierEnabled() && isClassifierSupportedLanguage) {
            this.shouldTriggerFromClassifier(undefined, editor, undefined)
        }
    }

    public recordClassifierResultForAutoTrigger(
        event: vscode.TextDocumentChangeEvent,
        editor: vscode.TextEditor,
        triggerType: CodewhispererAutomatedTriggerType
    ) {
        if (triggerType !== 'Classifier' && this.isClassifierEnabled()) {
            this.shouldTriggerFromClassifier(event, editor, triggerType)
        }
    }

    public isSupportedLanguage(language?: CodewhispererLanguage) {
        if (!language) {
            return false
        }
        return this.supportedLanguage.includes(language)
    }

    public shouldTriggerFromClassifier(
        event: vscode.TextDocumentChangeEvent | undefined,
        editor: vscode.TextEditor,
        autoTriggerType: string | undefined
    ): boolean {
        const fileContext = extractContextForCodeWhisperer(editor)
        const osPlatform = this.normalizeOsName(os.platform(), os.version())
        const char = event ? event.contentChanges[0].text : ''
        const lineNum = editor.selection.active.line
        const offSet = editor.selection.active.character
        const classifierResult = this.getClassifierResult(
            fileContext.leftFileContent,
            fileContext.rightFileContent,
            osPlatform,
            autoTriggerType,
            char,
            lineNum,
            offSet
        )

        const shouldTrigger = classifierResult > this.triggerThreshold
        TelemetryHelper.instance.setClassifierResult(classifierResult)
        return shouldTrigger
    }

    private getClassifierResult(
        leftContext: string,
        rightContext: string,
        os: string,
        triggerType: string | undefined,
        char: string,
        lineNum: number,
        cursorOffset: number
    ): number {
        const leftContextLines = leftContext.split(/\r?\n/)
        const leftContextAtCurrentLine = leftContextLines[leftContextLines.length - 1]
        const tokens = leftContextAtCurrentLine.trim().split(' ')
        const keyword = tokens[tokens.length - 1]
        const lengthOfLeftCurrent = leftContextLines[leftContextLines.length - 1].length
        const lengthOfLeftPrev = leftContextLines[leftContextLines.length - 2]?.length ?? 0
        const lengthofRight = rightContext.trim().length

        const triggerTypeCoefficient: number = this.triggerTypeCoefficientMap[triggerType || ''] ?? 0
        const osCoefficient: number = this.osCoefficientMap[os] ?? 0
        const charCoefficient: number = this.charCoefficient[char] ?? 0
        const keyWordCoefficient: number = this.charCoefficient[keyword] ?? 0

        const previousDecision = TelemetryHelper.instance.getLastTriggerDecisionForClassifier()

        let previousDecisionCoefficient = 0
        if (previousDecision === 'Accept') {
            previousDecisionCoefficient = this.prevDecisionAcceptCoefficient
        } else if (previousDecision === 'Reject') {
            previousDecisionCoefficient = this.prevDecisionRejectCoefficient
        } else if (previousDecision === 'Discard' || previousDecision === 'Empty') {
            previousDecisionCoefficient = this.prevDecisionOtherCoefficient
        }
        const lineDiff = this.lastInvocationLineNumber ? lineNum - this.lastInvocationLineNumber : 0

        const ideCoefficient = this.ideVscode

        const result =
            (this.lengthofRightCoefficient * (lengthofRight - this.minn.lenRight)) /
                (this.maxx.lenRight - this.minn.lenRight) +
            (this.lengthOfLeftCurrentCoefficient * (lengthOfLeftCurrent - this.minn.lenLeftCur)) /
                (this.maxx.lenLeftCur - this.minn.lenLeftCur) +
            (this.lengthOfLeftPrevCoefficient * (lengthOfLeftPrev - this.minn.lenLeftPrev)) /
                (this.maxx.lenLeftPrev - this.minn.lenLeftPrev) +
            (this.lineNumCoefficient * (lineNum - this.minn.lineNum)) / (this.maxx.lineNum - this.minn.lineNum) +
            (this.cursorOffsetCoefficient * (cursorOffset - this.minn.cursor)) / (this.maxx.cursor - this.minn.cursor) +
            (this.lineDiffCoefficient * (lineDiff - this.minn.lineDiff)) / (this.maxx.lineDiff - this.minn.lineDiff) +
            osCoefficient +
            triggerTypeCoefficient +
            charCoefficient +
            keyWordCoefficient +
            ideCoefficient +
            this.intercept +
            previousDecisionCoefficient

        return sigmoid(result)
    }

    private normalizeOsName(name: string, version: string | undefined): string {
        const lowercaseName = name.toLowerCase()
        if (lowercaseName.includes('windows')) {
            if (!version) {
                return 'Windows'
            } else if (version.includes('Windows NT 10') || version.startsWith('10')) {
                return 'Windows 10'
            } else if (version.includes('6.1')) {
                return 'Windows 7'
            } else if (version.includes('6.3')) {
                return 'Windows 8.1'
            } else {
                return 'Windows'
            }
        } else if (
            lowercaseName.includes('macos') ||
            lowercaseName.includes('mac os') ||
            lowercaseName.includes('darwin')
        ) {
            return 'Mac OS X'
        } else if (lowercaseName.includes('linux')) {
            return 'Linux'
        } else {
            return name
        }
    }
}

const sigmoid = (x: number) => {
    return 1 / (1 + Math.exp(-x))
}
