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

interface normalizedCoefficientsExp {
    readonly lineNum: number
    readonly lenLeftCur: number
    readonly lenLeftPrev: number
    readonly lenRight: number
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

    private supportedLanguage: CodewhispererLanguage[] = [
        'java',
        'javascript',
        'python',
        'typescript',
        'csharp',
        'tsx',
        'jsx',
    ]

    // ML classifier trigger threshold
    private triggerThreshold = 0.4
    private triggerThresholdExp = 0.43

    // ML classifier coefficients
    // os coefficient
    private osCoefficientMap: Readonly<Record<string, number>> = {
        'Mac OS X': 0.074052,
        win32: 0.018004,
        'Windows 10': 0.276541,
        'Windows 7': 0.033465,
    }

    private osCoefficientMapExp: Readonly<Record<string, number>> = {
        'Mac OS X': -0.0501,
        'Windows 10': 0.1411,
        Windows: 0.1182,
        win32: 0.1058,
    }
    // trigger type coefficient
    private triggerTypeCoefficientMap: Readonly<Record<string, number>> = {
        SpecialCharacters: 0.062397,
        Enter: 0.207027,
    }

    private triggerTypeCoefficientMapExp: Readonly<Record<string, number>> = {
        SpecialCharacters: 0.025,
        Enter: 0.2241,
    }

    private languageCoefficientMap: Readonly<Record<string, number>> = {
        java: -0.373711,
        javascript: -0.361063,
        python: -0.265584,
        typescript: -0.393076,
        tsx: -0.393076,
        jsx: -0.361063,
    }

    private languageCoefficientMapExp: Readonly<Record<string, number>> = {
        java: -0.2286,
        javascript: -0.3701,
        python: -0.2029,
        typescript: -0.492,
        tsx: -0.492,
        jsx: -0.3701,
        shell: -0.4533,
        ruby: -0.4498,
        sql: -0.4419,
        rust: -0.364,
        kotlin: -0.3344,
        php: -0.2521,
        csharp: -0.248,
        go: -0.196,
        scala: -0.1886,
        cpp: -0.1161,
    }

    // other metadata coefficient
    private lineNumCoefficient = 2.450734
    private cursorOffsetCoefficient = -1.999804
    private lengthOfLeftCurrentCoefficient = -1.01031
    private lengthOfLeftPrevCoefficient = 0.409877
    private lengthOfRightCoefficient = -0.425973
    private lineDiffCoefficient = 0.376956
    private prevDecisionAcceptCoefficient = 1.223303
    private prevDecisionRejectCoefficient = -0.150684
    private prevDecisionOtherCoefficient = -0.0093
    private ideVscode = -0.13566

    private lineNumCoefficientExp = 0.066
    private lengthOfLeftCurrentCoefficientExp = -1.217
    private lengthOfLeftPrevCoefficientExp = 0.3403
    private lengthOfRightCoefficientExp = -0.3354
    private prevDecisionAcceptCoefficientExp = 0.616
    private prevDecisionRejectCoefficientExp = -0.1266
    private prevDecisionOtherCoefficientExp = 0
    private ideVscodeExp = -0.1705
    private lengthLeft0To5Exp = -0.9889
    private lengthLeft5To10Exp = -0.5842
    private lengthLeft10To20Exp = -0.5162
    private lengthLeft20To30Exp = -0.329
    private lengthLeft30To40Exp = -0.1525
    private lengthLeft40To50Exp = -0.0812

    // intercept of logistic regression classifier
    private intercept = -0.04756079

    private interceptExp = 0.14018218

    private maxx: normalizedCoefficients = {
        cursor: 84716.0,
        lineNum: 2033.0,
        lenLeftCur: 157.0,
        lenLeftPrev: 157.0,
        lenRight: 10239.0,
        lineDiff: 270.0,
    }

    private maxxExp: normalizedCoefficientsExp = {
        lineNum: 4335.0,
        lenLeftCur: 157.0,
        lenLeftPrev: 173.0,
        lenRight: 10239.0,
    }

    private minn: normalizedCoefficients = {
        cursor: 1.0,
        lineNum: 0.0,
        lenLeftCur: 0.0,
        lenLeftPrev: 0.0,
        lenRight: 0.0,
        lineDiff: -28336.0,
    }

    private minnExp: normalizedCoefficientsExp = {
        lineNum: 0.0,
        lenLeftCur: 0.0,
        lenLeftPrev: 0.0,
        lenRight: 0.0,
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

    private charCoefficientExp: Readonly<Record<string, number>> = {
        true: -1.6948,
        false: -1.4366,
        throw: 1.0439,
        elif: 1.0115,
        '6': -0.972,
        pass: -0.9688,
        '8': -0.9349,
        '5': -0.9332,
        static: -0.9325,
        '0': -0.9184,
        False: -0.8644,
        None: -0.8633,
        True: -0.8559,
        null: -0.839,
        any: -0.8165,
        except: 0.8086,
        '7': -0.7957,
        '1': -0.7845,
        nil: -0.7811,
        async: -0.7767,
        break: -0.7731,
        '4': -0.7477,
        end: -0.7141,
        '/': -0.7045,
        '(': 0.6662,
        switch: 0.6539,
        '2': -0.651,
        '9': -0.6462,
        catch: 0.6222,
        '\\': -0.6198,
        ';': -0.6126,
        continue: -0.6103,
        foreach: 0.6026,
        private: -0.5876,
        final: -0.5823,
        case: 0.5748,
        float: -0.5673,
        for: 0.5592,
        this: 0.549,
        '3': -0.5424,
        '@': 0.5399,
        list: 0.5331,
        await: -0.5247,
        ']': -0.5212,
        struct: -0.5109,
        or: 0.5054,
        try: -0.4872,
        let: -0.4863,
        AS: 0.4804,
        val: -0.4602,
        map: 0.4598,
        ': ': 0.4588,
        auto: -0.4562,
        delete: 0.4511,
        print: 0.4486,
        export: -0.4452,
        ')': -0.4422,
        readonly: -0.4408,
        new: 0.4236,
        $: 0.4197,
        implements: 0.4044,
        W: 0.3999,
        with: 0.3867,
        void: -0.3861,
        '=': 0.3784,
        q: 0.3696,
        using: 0.3695,
        boolean: -0.3687,
        namespace: -0.3659,
        const: -0.3654,
        ' ': 0.3627,
        array: 0.3601,
        '*': -0.3529,
        mut: -0.3512,
        '#': 0.3477,
        range: 0.3442,
        p: 0.3366,
        h: 0.3311,
        require: 0.3299,
        o: 0.3248,
        local: 0.3203,
        import: -0.3179,
        '{': 0.3109,
        i: 0.3106,
        params: 0.3016,
        c: 0.3006,
        extern: -0.2991,
        f: 0.2977,
        '}': -0.2956,
        r: 0.29,
        if: 0.289,
        u: 0.2885,
        public: -0.2876,
        '>': -0.2833,
        package: 0.2789,
        raise: 0.273,
        AND: -0.2714,
        loop: 0.2686,
        a: 0.2663,
        ref: 0.2598,
        abstract: -0.2419,
        n: 0.24,
        '+': -0.236,
        e: 0.2345,
        impl: 0.2337,
        E: 0.2309,
        int: -0.2305,
        SELECT: -0.2297,
        ON: 0.2291,
        t: 0.2255,
        then: 0.223,
        m: 0.221,
        virtual: -0.2206,
        module: 0.2199,
        global: -0.2178,
        C: 0.2145,
        in: 0.214,
        mod: 0.2127,
        j: 0.2106,
        R: 0.2065,
        w: 0.2045,
        isset: 0.2024,
        var: -0.2017,
        s: 0.1994,
        func: 0.1974,
        echo: 0.196,
        select: -0.1946,
        assert: 0.1941,
        del: 0.1911,
        exit: -0.1889,
        uint: -0.1835,
        as: 0.183,
        source: -0.1805,
        double: -0.1799,
        l: 0.1794,
        class: -0.1747,
        WHERE: -0.1707,
        d: 0.1704,
        include: 0.1698,
        IF: -0.1693,
        FROM: 0.1673,
        '^': -0.1644,
        S: 0.1631,
        '|': 0.1594,
        v: 0.1589,
        object: 0.1587,
        debugger: -0.1567,
        b: 0.1567,
        P: 0.1554,
        y: 0.155,
        empty: 0.1504,
        '[': 0.1502,
        where: -0.1499,
        '.': 0.1473,
        lambda: 0.1473,
        operator: 0.1454,
        JOIN: 0.1448,
        else: -0.1438,
        N: 0.143,
        super: 0.1426,
        extends: 0.1422,
        unset: 0.1418,
        g: 0.1381,
        bool: -0.138,
        long: -0.1377,
        K: 0.1374,
        undef: -0.1365,
        internal: -0.1316,
        CASE: 0.1314,
        typeof: 0.1295,
        F: 0.1289,
        event: 0.1283,
        Z: -0.1276,
        finally: 0.1269,
        z: -0.126,
        do: -0.1239,
        from: 0.1228,
        constructor: 0.12,
        '!': 0.118,
        '&': 0.1168,
        "'": 0.1162,
        OR: 0.1152,
        '<': 0.1135,
        typedef: 0.113,
        '`': 0.1123,
        number: -0.1099,
        Y: 0.1094,
        '?': 0.1086,
        DISTINCT: -0.1079,
        A: 0.1046,
        next: 0.1034,
        B: 0.1,
        pub: -0.0994,
        M: 0.0993,
        when: 0.0986,
        short: -0.0985,
        elseif: 0.0908,
        move: 0.0905,
        UPDATE: 0.0897,
        register: -0.0897,
        IS: 0.0881,
        done: -0.0881,
        inline: -0.0878,
        trait: -0.0874,
        mutable: 0.0865,
        _: 0.0854,
        Q: 0.0846,
        X: 0.0837,
        NOT: -0.0832,
        type: 0.0827,
        INTO: 0.0825,
        function: -0.0812,
        not: -0.0807,
        endif: 0.0781,
        x: 0.0778,
        END: 0.0772,
        IN: 0.0769,
        NULL: 0.0748,
        fi: -0.073,
        D: 0.0716,
        keyof: 0.0713,
        crate: -0.0707,
        while: 0.0702,
        dyn: -0.0698,
        '%': -0.0688,
        BEGIN: 0.0681,
        self: -0.068,
        string: 0.068,
        bigint: -0.0678,
        H: 0.0668,
        WHEN: 0.0664,
        delegate: -0.065,
        fixed: 0.0647,
        instanceof: 0.064,
        unique: 0.0631,
        '~': 0.0611,
        elsif: 0.0605,
        interface: -0.0587,
        signed: -0.0587,
        USING: -0.0571,
        override: -0.0569,
        I: 0.0566,
        begin: -0.0564,
        rescue: 0.0563,
        defer: -0.0546,
        default: -0.0532,
        J: -0.0529,
        O: 0.0512,
        include_once: -0.0507,
        until: -0.0506,
        unsafe: -0.0473,
        alias: -0.047,
        yield: 0.0466,
        template: 0.0431,
        enum: 0.0429,
        protected: -0.0412,
        asm: -0.0411,
        die: 0.041,
        GET: -0.0403,
        RETURN: -0.0394,
        HAVING: 0.0386,
        char: 0.0379,
        AVG: 0.0378,
        FOR: -0.0371,
        RETURNING: -0.0368,
        VALUES: 0.0367,
        native: -0.0366,
        PROCEDURE: -0.0356,
        chan: -0.0354,
        T: -0.0349,
        FUNCTION: -0.0347,
        '"': 0.0341,
        typename: 0.0341,
        stackalloc: -0.034,
        shift: 0.0328,
        throws: 0.0318,
        and: 0.0312,
        G: -0.0311,
        L: 0.0309,
        THEN: -0.0288,
        LIMIT: -0.0284,
        ELSE: 0.0283,
        V: -0.0271,
        decimal: -0.0269,
        LIKE: -0.0261,
        unless: -0.026,
        asserts: 0.025,
        fn: -0.0248,
        checked: 0.0245,
        byte: 0.0241,
        redo: 0.0225,
        reinterpret_cast: 0.0223,
        wchar_t: 0.022,
        INDEX: 0.0219,
        def: 0.0217,
        return: 0.0209,
        transient: -0.0206,
        FETCH: 0.0202,
        exec: -0.0192,
        sealed: -0.0192,
        U: 0.0187,
        eval: -0.0185,
        explicit: -0.0183,
        __LINE__: 0.018,
        typeid: -0.0179,
        MAX: 0.0174,
        synchronized: -0.0161,
        REFERENCES: -0.0155,
        friend: 0.0154,
        never: -0.0153,
        require_once: -0.0152,
        FIRST: -0.015,
        DECLARE: -0.0142,
        out: -0.0137,
        symbol: -0.012,
        fallthrough: 0.0117,
        ',': 0.0111,
        union: 0.0109,
        '-': 0.0109,
        use: 0.0103,
        k: -0.0102,
        sizeof: 0.0083,
        base: 0.0065,
        OPEN: 0.0064,
        SUM: 0.0062,
        implicit: -0.0059,
        declare: 0.0057,
        clone: -0.0057,
        retry: -0.0057,
        UNION: -0.0055,
        go: -0.0051,
        CLOSE: 0.0046,
        ensure: -0.0046,
        lock: 0.0045,
        esac: -0.0029,
        match: 0.0027,
        COUNT: 0.0026,
        unsigned: -0.0024,
        BETWEEN: -0.0024,
        is: -0.0023,
        SET: -0.0022,
        SIGNAL: 0.0015,
        infer: -0.0014,
        VIEW: 0.0013,
        goto: -0.0003,
        CALL: -0.0002,
    }

    public setLastInvocationLineNumber(lineNumber: number) {
        this.lastInvocationLineNumber = lineNumber
    }

    public isClassifierExpEnabled(): boolean {
        return CodeWhispererUserGroupSettings.getUserGroup() === CodeWhispererConstants.UserGroup.Classifier
    }

    public getThreshold() {
        return this.isClassifierExpEnabled() ? this.triggerThresholdExp : this.triggerThreshold
    }

    public shouldInvokeClassifier(language: string) {
        if (this.isClassifierExpEnabled()) {
            return true
        }
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

    private calculateResultForExperimentGroup(
        triggerType: string | undefined,
        os: string,
        char: string,
        leftContext: string,
        rightContext: string,
        language: ProgrammingLanguage,
        lineNum: number
    ) {
        const leftContextLines = leftContext.split(/\r?\n/)
        const leftContextAtCurrentLine = leftContextLines[leftContextLines.length - 1]
        const tokens = leftContextAtCurrentLine.trim().split(' ')
        const keyword = tokens[tokens.length - 1]
        const lengthOfLeftCurrent = leftContextLines[leftContextLines.length - 1].length
        const lengthOfLeftPrev = leftContextLines[leftContextLines.length - 2]?.length ?? 0
        const lengthOfRight = rightContext.trim().length

        const triggerTypeCoefficient: number = this.triggerTypeCoefficientMapExp[triggerType || ''] ?? 0
        const osCoefficient: number = this.osCoefficientMapExp[os] ?? 0
        const charCoefficient: number = this.charCoefficientExp[char] ?? 0
        const keyWordCoefficient: number = this.charCoefficientExp[keyword] ?? 0
        const ideCoefficient = this.ideVscodeExp

        const previousDecision = TelemetryHelper.instance.getLastTriggerDecisionForClassifier()
        const languageCoefficient = this.languageCoefficientMapExp[language.languageName] ?? 0

        let previousDecisionCoefficient = 0
        if (previousDecision === 'Accept') {
            previousDecisionCoefficient = this.prevDecisionAcceptCoefficientExp
        } else if (previousDecision === 'Reject') {
            previousDecisionCoefficient = this.prevDecisionRejectCoefficientExp
        } else if (previousDecision === 'Discard' || previousDecision === 'Empty') {
            previousDecisionCoefficient = this.prevDecisionOtherCoefficientExp
        }

        let leftContextLengthCoefficient = 0
        if (leftContext.length >= 0 && leftContext.length < 5) {
            leftContextLengthCoefficient = this.lengthLeft0To5Exp
        } else if (leftContext.length >= 5 && leftContext.length < 10) {
            leftContextLengthCoefficient = this.lengthLeft5To10Exp
        } else if (leftContext.length >= 10 && leftContext.length < 20) {
            leftContextLengthCoefficient = this.lengthLeft10To20Exp
        } else if (leftContext.length >= 20 && leftContext.length < 30) {
            leftContextLengthCoefficient = this.lengthLeft20To30Exp
        } else if (leftContext.length >= 30 && leftContext.length < 40) {
            leftContextLengthCoefficient = this.lengthLeft30To40Exp
        } else if (leftContext.length >= 40 && leftContext.length < 50) {
            leftContextLengthCoefficient = this.lengthLeft40To50Exp
        }

        const result =
            (this.lengthOfRightCoefficientExp * (lengthOfRight - this.minnExp.lenRight)) /
                (this.maxxExp.lenRight - this.minnExp.lenRight) +
            (this.lengthOfLeftCurrentCoefficientExp * (lengthOfLeftCurrent - this.minnExp.lenLeftCur)) /
                (this.maxxExp.lenLeftCur - this.minnExp.lenLeftCur) +
            (this.lengthOfLeftPrevCoefficientExp * (lengthOfLeftPrev - this.minnExp.lenLeftPrev)) /
                (this.maxxExp.lenLeftPrev - this.minnExp.lenLeftPrev) +
            (this.lineNumCoefficientExp * (lineNum - this.minnExp.lineNum)) /
                (this.maxxExp.lineNum - this.minnExp.lineNum) +
            osCoefficient +
            triggerTypeCoefficient +
            charCoefficient +
            keyWordCoefficient +
            ideCoefficient +
            this.interceptExp +
            previousDecisionCoefficient +
            languageCoefficient +
            leftContextLengthCoefficient

        return sigmoid(result)
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
        const isExpGroup = this.isClassifierExpEnabled()
        if (isExpGroup) {
            return this.calculateResultForExperimentGroup(
                triggerType,
                os,
                char,
                leftContext,
                rightContext,
                language,
                lineNum
            )
        }
        const leftContextLines = leftContext.split(/\r?\n/)
        const leftContextAtCurrentLine = leftContextLines[leftContextLines.length - 1]
        const tokens = leftContextAtCurrentLine.trim().split(' ')
        const keyword = tokens[tokens.length - 1]
        const lengthOfLeftCurrent = leftContextLines[leftContextLines.length - 1].length
        const lengthOfLeftPrev = leftContextLines[leftContextLines.length - 2]?.length ?? 0
        const lengthOfRight = rightContext.trim().length

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
            (this.lengthOfRightCoefficient * (lengthOfRight - this.minn.lenRight)) /
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
