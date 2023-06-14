/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as os from 'os'
import * as vscode from 'vscode'
import { CodewhispererLanguage, CodewhispererAutomatedTriggerType } from '../../shared/telemetry/telemetry'
import { extractContextForCodeWhisperer } from '../util/editorContext'
import { TelemetryHelper } from '../util/telemetryHelper'
import * as CodeWhispererConstants from '../models/constants'
import { runtimeLanguageContext } from '../util/runtimeLanguageContext'
import { ProgrammingLanguage } from '../client/codewhispereruserclient'
import { CodeWhispererUserGroupSettings } from '../util/userGroupUtil'

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

    private supportedLanguage: CodewhispererLanguage[] = ['java', 'javascript', 'python', 'typescript', 'csharp']

    // ML classifier trigger threshold
    private triggerThreshold = 0.4

    // ML classifier coefficients
    // os coefficient
    private osCoefficientMap: Readonly<Record<string, number>> = {
        'Mac OS X': 0.074052,
        win32: 0.018004,
        'Windows 10': 0.276541,
        'Windows 7': 0.033465,
    }
    // trigger type coefficient
    private triggerTypeCoefficientMap: Readonly<Record<string, number>> = {
        SpecialCharacters: 0.062397,
        Enter: 0.207027,
    }

    private languageCoefficientMap: Readonly<Record<string, number>> = {
        java: -0.373711,
        javascript: -0.361063,
        python: -0.265584,
        typescript: -0.393076,
    }

    // other metadata coefficient
    private lineNumCoefficient = 2.450734
    private cursorOffsetCoefficient = -1.999804
    private lengthOfLeftCurrentCoefficient = -1.01031
    private lengthOfLeftPrevCoefficient = 0.409877
    private lengthofRightCoefficient = -0.425973
    private lineDiffCoefficient = 0.376956
    private prevDecisionAcceptCoefficient = 1.223303
    private prevDecisionRejectCoefficient = -0.150684
    private prevDecisionOtherCoefficient = -0.0093
    private ideVscode = -0.13566

    // intercept of logistic regression classifier
    private intercept = -0.04756079

    private maxx: normalizedCoefficients = {
        cursor: 84716.0,
        lineNum: 2033.0,
        lenLeftCur: 157.0,
        lenLeftPrev: 157.0,
        lenRight: 10239.0,
        lineDiff: 270.0,
    }

    private minn: normalizedCoefficients = {
        cursor: 1.0,
        lineNum: 0.0,
        lenLeftCur: 0.0,
        lenLeftPrev: 0.0,
        lenRight: 0.0,
        lineDiff: -28336.0,
    }
    // character and keywords coefficient
    private charCoefficient: Readonly<Record<string, number>> = {
        False: -0.100555,
        None: 0.17569,
        True: -0.178258,
        abstract: -0.15834,
        and: -0.024596,
        any: -0.544365,
        arguments: 0.335103,
        as: 0.05401,
        assert: 0.353779,
        async: -0.124699,
        await: 0.020518,
        base: -0.073404,
        bool: 0.211091,
        boolean: 0.122532,
        break: -0.24103,
        byte: 0.011294,
        case: 0.306454,
        catch: 1.011117,
        char: -0.032425,
        checked: 0.119966,
        class: 0.157217,
        const: -0.562091,
        continue: -0.795141,
        debugger: -0.389756,
        decimal: -0.016159,
        def: 0.764702,
        default: 0.128885,
        del: -0.119175,
        delegate: 0.252318,
        delete: 0.08044,
        do: -0.324889,
        double: 0.05154,
        elif: 1.126148,
        else: -0.197371,
        enum: -0.281307,
        eval: -0.052748,
        event: 0.289184,
        except: 1.382745,
        explicit: 0.074269,
        export: -0.473457,
        extends: 0.227949,
        extern: -0.048206,
        false: 0.199559,
        final: -1.032603,
        finally: 0.098665,
        fixed: -0.010055,
        float: 0.222521,
        for: 0.398045,
        foreach: 0.11888,
        from: 0.186388,
        function: 0.633685,
        get: -0.336991,
        global: 0.194718,
        goto: 0.0,
        if: 0.285611,
        implements: 0.050865,
        implicit: 0.0,
        import: -0.4132,
        in: 0.051704,
        instanceof: -0.052672,
        int: -0.303317,
        interface: -0.108621,
        internal: 0.116492,
        is: 0.136548,
        lambda: 0.871036,
        let: -0.86936,
        lock: 0.072837,
        long: 0.00141,
        module: 0.60729,
        namespace: -0.020135,
        native: 0.0,
        new: 0.386163,
        nonlocal: 0.0,
        not: 0.182461,
        null: 0.263079,
        number: 0.320519,
        object: 1.027146,
        operator: 0.165987,
        or: 0.732094,
        out: 0.005906,
        override: 0.007142,
        package: -0.092936,
        params: -0.176354,
        pass: -0.196426,
        private: -0.246091,
        protected: -0.272545,
        public: -0.051924,
        raise: 0.756536,
        readonly: -0.436268,
        ref: 0.345457,
        return: 0.160095,
        sbyte: 0.0,
        sealed: 0.0,
        short: 0.0,
        sizeof: 0.0,
        stackalloc: 0.0,
        static: -0.375867,
        strictfp: 0.0,
        string: 0.322148,
        struct: 0.017959,
        super: -0.105027,
        switch: 0.314464,
        synchronized: 0.009712,
        this: 0.647537,
        throw: 1.051869,
        throws: -0.081492,
        transient: 0.0,
        true: 0.334046,
        try: -0.208333,
        type: 0.080632,
        typeof: 0.302561,
        uint: -0.117281,
        ulong: 0.0,
        unchecked: 0.0,
        unsafe: 0.0,
        ushort: 0.0,
        using: 0.238978,
        var: -0.93915,
        virtual: 0.0,
        void: 0.407963,
        volatile: 0.0,
        while: 0.690455,
        with: 0.044612,
        yield: -0.05934,
        ' ': 0.013367,
        '!': -0.602744,
        '"': -0.313433,
        '#': -1.451026,
        $: -0.543131,
        '%': -0.46375,
        '&': -0.230705,
        "'": -0.370158,
        '(': 0.311588,
        ')': -0.678855,
        '*': -1.55312,
        '+': -0.680539,
        ',': -0.292725,
        '-': -0.924244,
        '.': -0.600106,
        '/': -1.516715,
        '0': -1.370073,
        '1': -1.169348,
        '2': -1.214625,
        '3': -0.565433,
        '4': -1.166687,
        '5': -1.05187,
        '6': -1.582377,
        '7': -1.441286,
        '8': -1.618119,
        '9': -1.27988,
        ':': 0.286831,
        ';': -1.203626,
        '<': -0.501071,
        '=': -0.125644,
        '>': -0.558503,
        '?': -0.747742,
        '@': -0.714408,
        A: -0.326736,
        B: -0.06952,
        C: -0.323881,
        D: -0.451991,
        E: -0.38431,
        F: -0.409905,
        G: -0.414273,
        H: -0.124009,
        I: -0.247836,
        J: -0.413883,
        K: -0.506134,
        L: -0.244958,
        M: -0.330313,
        N: -0.547069,
        O: -0.377159,
        P: -0.384669,
        Q: -0.178263,
        R: -0.399382,
        S: -0.253475,
        T: -0.374648,
        U: -0.634745,
        V: -0.254289,
        W: -0.435266,
        X: -0.104978,
        Y: -0.673677,
        Z: -0.321751,
        '[': -0.308607,
        '\\': -1.585668,
        ']': -0.926303,
        '^': -0.202878,
        _: -0.29104,
        '`': -1.069063,
        a: -0.239194,
        b: -0.247252,
        c: -0.227998,
        d: -0.129967,
        e: -0.127679,
        f: -0.162548,
        g: -0.29125,
        h: -0.046323,
        i: -0.138365,
        j: -0.612214,
        k: -0.322862,
        l: -0.191089,
        m: -0.213291,
        n: -0.071243,
        o: -0.154546,
        p: -0.317108,
        q: -0.380481,
        r: -0.047085,
        s: -0.227227,
        t: -0.094364,
        u: -0.005051,
        v: -0.234286,
        w: -0.030931,
        x: -0.176206,
        y: -0.028819,
        z: -0.758794,
        '{': 0.084282,
        '|': -0.250823,
        '}': -0.932405,
        '~': -0.290281,
    }

    public setLastInvocationLineNumber(lineNumber: number) {
        this.lastInvocationLineNumber = lineNumber
    }

    public isClassifierEnabled(): boolean {
        return CodeWhispererUserGroupSettings.getUserGroup() === CodeWhispererConstants.UserGroup.Classifier
    }

    public getThreshold() {
        return this.triggerThreshold
    }

    public shouldInvokeClassifier(language: string) {
        const mappedLanguage = runtimeLanguageContext.mapVscLanguageToCodeWhispererLanguage(language)
        return this.isSupportedLanguage(mappedLanguage)
    }

    public recordClassifierResultForManualTrigger(editor: vscode.TextEditor) {
        if (this.shouldInvokeClassifier(editor.document.languageId)) {
            this.shouldTriggerFromClassifier(undefined, editor, undefined, true)
        }
    }

    public recordClassifierResultForAutoTrigger(
        editor: vscode.TextEditor,
        triggerType?: CodewhispererAutomatedTriggerType,
        event?: vscode.TextDocumentChangeEvent
    ) {
        if (!triggerType) {
            return
        }
        this.shouldTriggerFromClassifier(event, editor, triggerType, true)
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
        autoTriggerType: string | undefined,
        shouldRecordResult: boolean = false
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
            offSet,
            fileContext.programmingLanguage
        )

        const threshold = this.getThreshold()

        const shouldTrigger = classifierResult > threshold
        if (shouldRecordResult) {
            TelemetryHelper.instance.setClassifierResult(classifierResult)
            TelemetryHelper.instance.setClassifierThreshold(threshold)
        }
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
        language: ProgrammingLanguage
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
        const languageCoefficient = this.languageCoefficientMap[language.languageName] ?? 0

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
            previousDecisionCoefficient +
            languageCoefficient

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
