/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as os from 'os'
import * as vscode from 'vscode'
import { CodewhispererLanguage } from '../../shared/telemetry/telemetry'
import { extractContextForCodeWhisperer } from '../util/editorContext'
import { runtimeLanguageContext } from '../util/runtimeLanguageContext'
import { TelemetryHelper } from '../util/telemetryHelper'

interface normalizedCoefficients {
    readonly cursor: number
    readonly lineNum: number
    readonly lenLeftCur: number
    readonly lenLeftPrev: number
    readonly lenRight: number
    readonly lineDiff: number
    readonly timeDiff: number
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
        'Mac OS X': 0.1168,
        win32: 0.0973,
        'Windows 10': 0.3181,
        'Windows 7': 0.2702,
    }
    // trigger type coefficient
    private triggerTypeCoefficientMap: Readonly<Record<string, number>> = {
        SpecialCharacters: -0.1402,
        Enter: 0.1915,
    }
    // language coefficient
    private languageCoefficientMap: Readonly<Record<string, number>> = {
        python: 0.1376,
    }
    // other metadata coefficient
    private lineNumCoefficient = 0.5011
    private cursorOffsetCoefficient = -0.2242
    private lengthOfLeftCurrentCoefficient = -0.989
    private lengthOfLeftPrevCoefficient = 0.4184
    private lengthofRightCoefficient = -0.5168
    private lineDiffCoefficient = 0.0546
    private prevDecisionAcceptCoefficient = 1.3668
    private prevDecisionRejectCoefficient = -0.0017
    private prevDecisionOtherCoefficient = 0.1409
    private ideVscode = -0.0513

    // intercept of logistic regression classifier
    private intercept = -0.44590798

    private maxx: normalizedCoefficients = {
        cursor: 88911.0,
        lineNum: 1997.0,
        lenLeftCur: 164.0,
        lenLeftPrev: 160.0,
        lenRight: 10239.0,
        lineDiff: 349.0,
        timeDiff: 268602852.0,
    }

    private minn: normalizedCoefficients = {
        cursor: 0.0,
        lineNum: 0.0,
        lenLeftCur: 0.0,
        lenLeftPrev: 0.0,
        lenRight: 0.0,
        lineDiff: -32222.0,
        timeDiff: 0.0,
    }
    // character and keywords coefficient
    private charCoefficient: Readonly<Record<string, number>> = {
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

    public setLastInvocationLineNumber(lineNumber: number) {
        this.lastInvocationLineNumber = lineNumber
    }

    public isSupportedLanguage(language?: CodewhispererLanguage) {
        if (!language) {
            return false
        }
        return this.supportedLanguage.includes(language)
    }

    public shouldTriggerFromClassifier(
        event: vscode.TextDocumentChangeEvent,
        editor: vscode.TextEditor,
        autoTriggerType: string | undefined
    ): boolean {
        const fileContext = extractContextForCodeWhisperer(editor)
        const osPlatform = this.normalizeOsName(os.platform(), os.version())
        const char = event.contentChanges[0].text
        const lineNum = editor.selection.active.line
        const offSet = editor.selection.active.character
        const classifierResult = this.getClassifierResult(
            fileContext.leftFileContent,
            fileContext.rightFileContent,
            osPlatform,
            autoTriggerType,
            char,
            lineNum,
            offSet,
            runtimeLanguageContext.mapVscLanguageToCodeWhispererLanguage(editor.document.languageId)
        )

        const shouldTrigger = classifierResult > this.triggerThreshold
        TelemetryHelper.instance.setClassifierResult(sigmoid(classifierResult))
        return shouldTrigger
    }

    private getClassifierResult(
        leftContext: string,
        rightContext: string,
        os: string,
        triggerType: string | undefined,
        char: string,
        lineNum: number,
        cursorOffset: number,
        language: CodewhispererLanguage | undefined
    ): number {
        if (!language) {
            return 0
        }
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
        const languageCoefficient: number = this.languageCoefficientMap[language] ?? 0

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
            languageCoefficient +
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
