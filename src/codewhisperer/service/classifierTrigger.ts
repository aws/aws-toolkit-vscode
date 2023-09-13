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
        'Mac OS X': -0.1552,
        'Windows 10': -0.0238,
        Windows: 0.0412,
        win32: -0.0559,
    }
    // trigger type coefficient
    private triggerTypeCoefficientMap: Readonly<Record<string, number>> = {
        SpecialCharacters: 0.062397,
        Enter: 0.207027,
    }

    private triggerTypeCoefficientMapExp: Readonly<Record<string, number>> = {
        SpecialCharacters: 0.0209,
        Enter: 0.2853,
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
        java: -0.4622,
        javascript: -0.4688,
        python: -0.3052,
        typescript: -0.6084,
        tsx: -0.6084,
        jsx: -0.4688,
        shell: -0.4718,
        ruby: -0.7356,
        sql: -0.4937,
        rust: -0.4309,
        kotlin: -0.4739,
        php: -0.3917,
        csharp: -0.3475,
        go: -0.3504,
        scala: -0.534,
        cpp: -0.1734,
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

    private lineNumCoefficientExp = -0.0416
    private lengthOfLeftCurrentCoefficientExp = -1.1747
    private lengthOfLeftPrevCoefficientExp = 0.4033
    private lengthOfRightCoefficientExp = -0.3321
    private prevDecisionAcceptCoefficientExp = 0.5397
    private prevDecisionRejectCoefficientExp = -0.1656
    private prevDecisionOtherCoefficientExp = 0
    private ideVscodeExp = -0.1905
    private lengthLeft0To5Exp = -0.8756
    private lengthLeft5To10Exp = -0.5463
    private lengthLeft10To20Exp = -0.4081
    private lengthLeft20To30Exp = -0.3272
    private lengthLeft30To40Exp = -0.2442
    private lengthLeft40To50Exp = -0.1471

    // intercept of logistic regression classifier
    private intercept = -0.04756079

    private interceptExp = 0.3738713

    private maxx: normalizedCoefficients = {
        cursor: 84716.0,
        lineNum: 2033.0,
        lenLeftCur: 157.0,
        lenLeftPrev: 157.0,
        lenRight: 10239.0,
        lineDiff: 270.0,
    }

    private maxxExp: normalizedCoefficientsExp = {
        lineNum: 4631.0,
        lenLeftCur: 157.0,
        lenLeftPrev: 176.0,
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
        throw: 1.5868,
        ';': -1.268,
        any: -1.1565,
        '7': -1.1347,
        false: -1.1307,
        nil: -1.0653,
        elif: 1.0122,
        '9': -1.0098,
        pass: -1.0058,
        True: -1.0002,
        False: -0.9434,
        '6': -0.9222,
        true: -0.9142,
        None: -0.9027,
        '8': -0.9013,
        break: -0.8475,
        '}': -0.847,
        '5': -0.8414,
        '4': -0.8197,
        '1': -0.8085,
        '\\': -0.8019,
        static: -0.7748,
        '0': -0.77,
        end: -0.7617,
        '(': 0.7239,
        '/': -0.7104,
        where: -0.6981,
        readonly: -0.6741,
        async: -0.6723,
        '3': -0.654,
        continue: -0.6413,
        struct: -0.64,
        try: -0.6369,
        float: -0.6341,
        using: 0.6079,
        '@': 0.6016,
        '|': 0.5993,
        impl: 0.5808,
        private: -0.5746,
        for: 0.5741,
        '2': -0.5634,
        let: -0.5187,
        foreach: 0.5186,
        select: -0.5148,
        export: -0.5,
        mut: -0.4921,
        ')': -0.463,
        ']': -0.4611,
        when: 0.4602,
        virtual: -0.4583,
        extern: -0.4465,
        catch: 0.4446,
        new: 0.4394,
        val: -0.4339,
        map: 0.4284,
        case: 0.4271,
        throws: 0.4221,
        null: -0.4197,
        protected: -0.4133,
        q: 0.4125,
        except: 0.4115,
        ': ': 0.4072,
        '^': -0.407,
        ' ': 0.4066,
        $: 0.3981,
        this: 0.3962,
        switch: 0.3947,
        '*': -0.3931,
        module: 0.3912,
        array: 0.385,
        '=': 0.3828,
        p: 0.3728,
        ON: 0.3708,
        '`': 0.3693,
        u: 0.3658,
        a: 0.3654,
        require: 0.3646,
        '>': -0.3644,
        const: -0.3476,
        o: 0.3423,
        sizeof: 0.3416,
        object: 0.3362,
        w: 0.3345,
        print: 0.3344,
        range: 0.3336,
        if: 0.3324,
        abstract: -0.3293,
        var: -0.3239,
        i: 0.321,
        while: 0.3138,
        J: 0.3137,
        c: 0.3118,
        await: -0.3072,
        from: 0.3057,
        f: 0.302,
        echo: 0.2995,
        '#': 0.2984,
        e: 0.2962,
        r: 0.2925,
        mod: 0.2893,
        loop: 0.2874,
        t: 0.2832,
        '~': 0.282,
        final: -0.2816,
        del: 0.2785,
        override: -0.2746,
        ref: -0.2737,
        h: 0.2693,
        m: 0.2681,
        '{': 0.2674,
        implements: 0.2672,
        inline: -0.2642,
        match: 0.2613,
        with: -0.261,
        x: 0.2597,
        namespace: -0.2596,
        operator: 0.2573,
        double: -0.2563,
        source: -0.2482,
        import: -0.2419,
        NULL: -0.2399,
        l: 0.239,
        or: 0.2378,
        s: 0.2366,
        then: 0.2354,
        W: 0.2354,
        y: 0.2333,
        local: 0.2288,
        is: 0.2282,
        n: 0.2254,
        '+': -0.2251,
        G: 0.223,
        public: -0.2229,
        WHERE: 0.2224,
        list: 0.2204,
        Q: 0.2204,
        '[': 0.2136,
        VALUES: 0.2134,
        H: 0.2105,
        g: 0.2094,
        else: -0.208,
        bool: -0.2066,
        long: -0.2059,
        R: 0.2025,
        S: 0.2021,
        d: 0.2003,
        V: 0.1974,
        K: -0.1961,
        '<': 0.1958,
        debugger: -0.1929,
        NOT: -0.1911,
        b: 0.1907,
        boolean: -0.1891,
        z: -0.1866,
        LIKE: -0.1793,
        raise: 0.1782,
        L: 0.1768,
        fn: 0.176,
        delete: 0.1714,
        unsigned: -0.1675,
        auto: -0.1648,
        finally: 0.1616,
        k: 0.1599,
        as: 0.156,
        instanceof: 0.1558,
        '&': 0.1554,
        E: 0.1551,
        M: 0.1542,
        I: 0.1503,
        Y: 0.1493,
        typeof: 0.1475,
        j: 0.1445,
        INTO: 0.1442,
        IF: 0.1437,
        next: 0.1433,
        undef: -0.1427,
        THEN: -0.1416,
        v: 0.1415,
        C: 0.1383,
        P: 0.1353,
        AND: -0.1345,
        constructor: 0.1337,
        void: -0.1336,
        class: -0.1328,
        defer: 0.1316,
        begin: 0.1306,
        FROM: -0.1304,
        SET: 0.1291,
        decimal: -0.1278,
        friend: 0.1277,
        SELECT: -0.1265,
        event: 0.1259,
        lambda: 0.1253,
        enum: 0.1215,
        A: 0.121,
        lock: 0.1187,
        ensure: 0.1184,
        '%': 0.1177,
        isset: 0.1175,
        O: 0.1174,
        '.': 0.1146,
        UNION: -0.1145,
        alias: -0.1129,
        template: -0.1102,
        WHEN: 0.1093,
        rescue: 0.1083,
        DISTINCT: -0.1074,
        trait: -0.1073,
        D: 0.1062,
        in: 0.1045,
        internal: -0.1029,
        ',': 0.1027,
        static_cast: 0.1016,
        do: -0.1005,
        OR: 0.1003,
        AS: -0.1001,
        interface: 0.0996,
        super: 0.0989,
        B: 0.0963,
        U: 0.0962,
        T: 0.0943,
        CALL: -0.0918,
        BETWEEN: -0.0915,
        N: 0.0897,
        yield: 0.0867,
        done: -0.0857,
        string: -0.0837,
        out: -0.0831,
        volatile: -0.0819,
        retry: 0.0816,
        '?': -0.0796,
        number: -0.0791,
        short: 0.0787,
        sealed: -0.0776,
        package: 0.0765,
        OPEN: -0.0756,
        base: 0.0735,
        and: 0.0729,
        exit: 0.0726,
        _: 0.0721,
        keyof: -0.072,
        def: 0.0713,
        crate: -0.0706,
        '-': -0.07,
        FUNCTION: 0.0692,
        declare: -0.0678,
        include: 0.0671,
        COUNT: -0.0669,
        INDEX: -0.0666,
        CLOSE: -0.0651,
        fi: -0.0644,
        uint: 0.0624,
        params: 0.0575,
        HAVING: 0.0575,
        byte: -0.0575,
        clone: -0.0552,
        char: -0.054,
        func: 0.0538,
        never: -0.053,
        unset: -0.0524,
        unless: -0.051,
        esac: -0.0509,
        shift: -0.0507,
        require_once: 0.0486,
        ELSE: -0.0477,
        extends: 0.0461,
        elseif: 0.0452,
        mutable: -0.0451,
        asm: 0.0449,
        '!': 0.0446,
        LIMIT: 0.0444,
        ushort: -0.0438,
        '"': -0.0433,
        Z: 0.0431,
        exec: -0.0431,
        IS: -0.0429,
        DECLARE: -0.0425,
        __LINE__: -0.0424,
        BEGIN: -0.0418,
        typedef: 0.0414,
        EXIT: -0.0412,
        "'": 0.041,
        function: -0.0393,
        dyn: -0.039,
        wchar_t: -0.0388,
        unique: -0.0383,
        include_once: 0.0367,
        stackalloc: 0.0359,
        RETURN: -0.0356,
        const_cast: 0.035,
        MAX: 0.0341,
        assert: -0.0331,
        JOIN: -0.0328,
        use: 0.0318,
        GET: 0.0317,
        VIEW: 0.0314,
        move: 0.0308,
        typename: 0.0308,
        die: 0.0305,
        asserts: -0.0304,
        reinterpret_cast: -0.0302,
        USING: -0.0289,
        elsif: -0.0285,
        FIRST: -0.028,
        self: -0.0278,
        RETURNING: -0.0278,
        symbol: -0.0273,
        OFFSET: 0.0263,
        bigint: 0.0253,
        register: -0.0237,
        union: -0.0227,
        return: -0.0227,
        until: -0.0224,
        endfor: -0.0213,
        implicit: -0.021,
        LOOP: 0.0195,
        pub: 0.0182,
        global: 0.0179,
        EXCEPTION: 0.0175,
        delegate: 0.0173,
        signed: -0.0163,
        FOR: 0.0156,
        unsafe: 0.014,
        NEXT: -0.0133,
        IN: 0.0129,
        MIN: -0.0123,
        go: -0.0112,
        type: -0.0109,
        explicit: -0.0107,
        eval: -0.0104,
        int: -0.0099,
        CASE: -0.0096,
        END: 0.0084,
        UPDATE: 0.0074,
        default: 0.0072,
        chan: 0.0068,
        fixed: 0.0066,
        not: -0.0052,
        X: -0.0047,
        endforeach: 0.0031,
        goto: 0.0028,
        empty: 0.0022,
        checked: 0.0012,
        F: -0.001,
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
        let keyword = ''
        const lastToken = tokens[tokens.length - 1]
        if (lastToken && lastToken.length > 1) {
            keyword = lastToken
        }
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
        let keyword = ''
        const lastToken = tokens[tokens.length - 1]
        if (lastToken && lastToken.length > 1) {
            keyword = lastToken
        }
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
