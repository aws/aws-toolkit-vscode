/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as os from 'os'
import * as vscode from 'vscode'
import { CodewhispererAutomatedTriggerType } from '../../shared/telemetry/telemetry'
import { extractContextForCodeWhisperer } from '../util/editorContext'
import { TelemetryHelper } from '../util/telemetryHelper'
import { ProgrammingLanguage } from '../client/codewhispereruserclient'

interface normalizedCoefficients {
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

    // ML classifier trigger threshold
    private triggerThreshold = 0.43

    // ML classifier coefficients
    // os coefficient
    private osCoefficientMap: Readonly<Record<string, number>> = {
        'Mac OS X': -0.1552,
        'Windows 10': -0.0238,
        Windows: 0.0412,
        win32: -0.0559,
    }

    // trigger type coefficient
    private triggerTypeCoefficientMap: Readonly<Record<string, number>> = {
        SpecialCharacters: 0.0209,
        Enter: 0.2853,
    }

    private languageCoefficientMap: Readonly<Record<string, number>> = {
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
        json: 0,
        yaml: -0.3,
        tf: -0.55,
    }

    // other metadata coefficient
    private lineNumCoefficient = -0.0416
    private lengthOfLeftCurrentCoefficient = -1.1747
    private lengthOfLeftPrevCoefficient = 0.4033
    private lengthOfRightCoefficient = -0.3321
    private prevDecisionAcceptCoefficient = 0.5397
    private prevDecisionRejectCoefficient = -0.1656
    private prevDecisionOtherCoefficient = 0
    private ideVscode = -0.1905
    private lengthLeft0To5 = -0.8756
    private lengthLeft5To10 = -0.5463
    private lengthLeft10To20 = -0.4081
    private lengthLeft20To30 = -0.3272
    private lengthLeft30To40 = -0.2442
    private lengthLeft40To50 = -0.1471

    // intercept of logistic regression classifier
    private intercept = 0.3738713

    private maxx: normalizedCoefficients = {
        lineNum: 4631.0,
        lenLeftCur: 157.0,
        lenLeftPrev: 176.0,
        lenRight: 10239.0,
    }

    private minn: normalizedCoefficients = {
        lineNum: 0.0,
        lenLeftCur: 0.0,
        lenLeftPrev: 0.0,
        lenRight: 0.0,
    }

    // character and keywords coefficient
    private charCoefficient: Readonly<Record<string, number>> = {
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

    public getThreshold() {
        return this.triggerThreshold
    }

    public recordClassifierResultForManualTrigger(editor: vscode.TextEditor) {
        this.shouldTriggerFromClassifier(undefined, editor, undefined, true)
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
        const classifierResult = this.getClassifierResult(
            fileContext.leftFileContent,
            fileContext.rightFileContent,
            osPlatform,
            autoTriggerType,
            char,
            lineNum,
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
        language: ProgrammingLanguage
    ): number {
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
        const ideCoefficient = this.ideVscode

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

        let leftContextLengthCoefficient = 0
        if (leftContext.length >= 0 && leftContext.length < 5) {
            leftContextLengthCoefficient = this.lengthLeft0To5
        } else if (leftContext.length >= 5 && leftContext.length < 10) {
            leftContextLengthCoefficient = this.lengthLeft5To10
        } else if (leftContext.length >= 10 && leftContext.length < 20) {
            leftContextLengthCoefficient = this.lengthLeft10To20
        } else if (leftContext.length >= 20 && leftContext.length < 30) {
            leftContextLengthCoefficient = this.lengthLeft20To30
        } else if (leftContext.length >= 30 && leftContext.length < 40) {
            leftContextLengthCoefficient = this.lengthLeft30To40
        } else if (leftContext.length >= 40 && leftContext.length < 50) {
            leftContextLengthCoefficient = this.lengthLeft40To50
        }

        const result =
            (this.lengthOfRightCoefficient * (lengthOfRight - this.minn.lenRight)) /
                (this.maxx.lenRight - this.minn.lenRight) +
            (this.lengthOfLeftCurrentCoefficient * (lengthOfLeftCurrent - this.minn.lenLeftCur)) /
                (this.maxx.lenLeftCur - this.minn.lenLeftCur) +
            (this.lengthOfLeftPrevCoefficient * (lengthOfLeftPrev - this.minn.lenLeftPrev)) /
                (this.maxx.lenLeftPrev - this.minn.lenLeftPrev) +
            (this.lineNumCoefficient * (lineNum - this.minn.lineNum)) / (this.maxx.lineNum - this.minn.lineNum) +
            osCoefficient +
            triggerTypeCoefficient +
            charCoefficient +
            keyWordCoefficient +
            ideCoefficient +
            this.intercept +
            previousDecisionCoefficient +
            languageCoefficient +
            leftContextLengthCoefficient

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
