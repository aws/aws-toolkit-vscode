// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.service

import software.aws.toolkits.jetbrains.services.codewhisperer.language.CodeWhispererProgrammingLanguage
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererCsharp
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererJava
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererJavaScript
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererJsx
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererPlainText
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererPython
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererTsx
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererTypeScript
import software.aws.toolkits.telemetry.CodewhispererAutomatedTriggerType

object CodeWhispererClassifierConstants {
    val osMap: Map<String, Double> = mapOf(
        "Mac OS X" to 0.0741,
        "win32" to 0.018,
        "Windows 10" to 0.2765,
        "Windows 7" to 0.0335,
    )

    // these are used for 100% classifier driven auto trigger
    val triggerTypeCoefficientMap: Map<CodewhispererAutomatedTriggerType, Double> = mapOf(
        CodewhispererAutomatedTriggerType.SpecialCharacters to 0.0624,
        CodewhispererAutomatedTriggerType.Enter to 0.207
    )

    val languageMap: Map<CodeWhispererProgrammingLanguage, Double> = mapOf(
        CodeWhispererPython.INSTANCE to -0.2656,
        CodeWhispererJava.INSTANCE to -0.3737,
        CodeWhispererJavaScript.INSTANCE to -0.3611,
        CodeWhispererCsharp.INSTANCE to 0.0,
        CodeWhispererPlainText.INSTANCE to 0.0,
        CodeWhispererTypeScript.INSTANCE to -0.3931,
        CodeWhispererTsx.INSTANCE to 0.0,
        CodeWhispererJsx.INSTANCE to 0.0
    )

    // other metadata coefficient
    const val lineNumCoefficient = 2.4507

    const val cursorOffsetCoefficient = -1.9998

    // length of the current line of left_context
    const val lengthOfLeftCurrentCoefficient = -1.0103

    // length of the previous line of left context
    const val lengthOfLeftPrevCoefficient = 0.4099

    // lenght of right_context
    const val lengthofRightCoefficient = -0.426

    const val lineDiffCoefficient = 0.377

    const val prevDecisionAcceptCoefficient = 1.2233

    const val prevDecisionRejectCoefficient = -0.1507

    const val prevDecisionOtherCoefficient = -0.0093

    // intercept of logistic regression classifier
    const val intercept = -0.04756079

    val coefficientsMap = mapOf<String, Double>(
        "False" to -0.1006,
        "None" to 0.1757,
        "True" to -0.1783,
        "abstract" to -0.1583,
        "and" to -0.0246,
        "any" to -0.5444,
        "arguments" to 0.3351,
        "as" to 0.054,
        "assert" to 0.3538,
        "async" to -0.1247,
        "await" to 0.0205,
        "base" to -0.0734,
        "bool" to 0.2111,
        "boolean" to 0.1225,
        "break" to -0.241,
        "byte" to 0.0113,
        "case" to 0.3065,
        "catch" to 1.0111,
        "char" to -0.0324,
        "checked" to 0.12,
        "class" to 0.1572,
        "const" to -0.5621,
        "continue" to -0.7951,
        "debugger" to -0.3898,
        "decimal" to -0.0162,
        "def" to 0.7647,
        "default" to 0.1289,
        "del" to -0.1192,
        "delegate" to 0.2523,
        "delete" to 0.0804,
        "do" to -0.3249,
        "double" to 0.0515,
        "elif" to 1.1261,
        "else" to -0.1974,
        "enum" to -0.2813,
        "eval" to -0.0527,
        "event" to 0.2892,
        "except" to 1.3827,
        "explicit" to 0.0743,
        "export" to -0.4735,
        "extends" to 0.2279,
        "extern" to -0.0482,
        "false" to 0.1996,
        "final" to -1.0326,
        "finally" to 0.0987,
        "fixed" to -0.0101,
        "float" to 0.2225,
        "for" to 0.398,
        "foreach" to 0.1189,
        "from" to 0.1864,
        "function" to 0.6337,
        "get" to -0.337,
        "global" to 0.1947,
        "goto" to 0.0,
        "if" to 0.2856,
        "implements" to 0.0509,
        "implicit" to 0.0,
        "import" to -0.4132,
        "in" to 0.0517,
        "instanceof" to -0.0527,
        "int" to -0.3033,
        "interface" to -0.1086,
        "internal" to 0.1165,
        "is" to 0.1365,
        "lambda" to 0.871,
        "let" to -0.8694,
        "lock" to 0.0728,
        "long" to 0.0014,
        "module" to 0.6073,
        "namespace" to -0.0201,
        "native" to 0.0,
        "new" to 0.3862,
        "nonlocal" to 0.0,
        "not" to 0.1825,
        "null" to 0.2631,
        "number" to 0.3205,
        "object" to 1.0271,
        "operator" to 0.166,
        "or" to 0.7321,
        "out" to 0.0059,
        "override" to 0.0071,
        "package" to -0.0929,
        "params" to -0.1764,
        "pass" to -0.1964,
        "private" to -0.2461,
        "protected" to -0.2725,
        "public" to -0.0519,
        "raise" to 0.7565,
        "readonly" to -0.4363,
        "ref" to 0.3455,
        "return" to 0.1601,
        "sbyte" to 0.0,
        "sealed" to 0.0,
        "short" to 0.0,
        "sizeof" to 0.0,
        "stackalloc" to 0.0,
        "static" to -0.3759,
        "strictfp" to 0.0,
        "string" to 0.3221,
        "struct" to 0.018,
        "super" to -0.105,
        "switch" to 0.3145,
        "synchronized" to 0.0097,
        "this" to 0.6475,
        "throw" to 1.0519,
        "throws" to -0.0815,
        "transient" to 0.0,
        "true" to 0.334,
        "try" to -0.2083,
        "type" to 0.0806,
        "typeof" to 0.3026,
        "uint" to -0.1173,
        "ulong" to 0.0,
        "unchecked" to 0.0,
        "unsafe" to 0.0,
        "ushort" to 0.0,
        "using" to 0.239,
        "var" to -0.9392,
        "virtual" to 0.0,
        "void" to 0.408,
        "volatile" to 0.0,
        "while" to 0.6905,
        "with" to 0.0446,
        "yield" to -0.0593,
        " " to 0.0134,
        "!" to -0.6027,
        "\"" to -0.3134,
        "#" to -1.451,
        "$" to -0.5431,
        "%" to -0.4637,
        "&" to -0.2307,
        "'" to -0.3702,
        "(" to 0.3116,
        ")" to -0.6789,
        "*" to -1.5531,
        "+" to -0.6805,
        "," to -0.2927,
        "-" to -0.9242,
        "." to -0.6001,
        "/" to -1.5167,
        "0" to -1.3701,
        "1" to -1.1693,
        "2" to -1.2146,
        "3" to -0.5654,
        "4" to -1.1667,
        "5" to -1.0519,
        "6" to -1.5824,
        "7" to -1.4413,
        "8" to -1.6181,
        "9" to -1.2799,
        ":" to 0.2868,
        ";" to -1.2036,
        "<" to -0.5011,
        "=" to -0.1256,
        ">" to -0.5585,
        "?" to -0.7477,
        "@" to -0.7144,
        "A" to -0.3267,
        "B" to -0.0695,
        "C" to -0.3239,
        "D" to -0.452,
        "E" to -0.3843,
        "F" to -0.4099,
        "G" to -0.4143,
        "H" to -0.124,
        "I" to -0.2478,
        "J" to -0.4139,
        "K" to -0.5061,
        "L" to -0.245,
        "M" to -0.3303,
        "N" to -0.5471,
        "O" to -0.3772,
        "P" to -0.3847,
        "Q" to -0.1783,
        "R" to -0.3994,
        "S" to -0.2535,
        "T" to -0.3746,
        "U" to -0.6347,
        "V" to -0.2543,
        "W" to -0.4353,
        "X" to -0.105,
        "Y" to -0.6737,
        "Z" to -0.3218,
        "[" to -0.3086,
        "\\" to -1.5857,
        "]" to -0.9263,
        "^" to -0.2029,
        "_" to -0.291,
        "`" to -1.0691,
        "a" to -0.2392,
        "b" to -0.2473,
        "c" to -0.228,
        "d" to -0.13,
        "e" to -0.1277,
        "f" to -0.1625,
        "g" to -0.2912,
        "h" to -0.0463,
        "i" to -0.1384,
        "j" to -0.6122,
        "k" to -0.3229,
        "l" to -0.1911,
        "m" to -0.2133,
        "n" to -0.0712,
        "o" to -0.1545,
        "p" to -0.3171,
        "q" to -0.3805,
        "r" to -0.0471,
        "s" to -0.2272,
        "t" to -0.0944,
        "u" to -0.0051,
        "v" to -0.2343,
        "w" to -0.0309,
        "x" to -0.1762,
        "y" to -0.0288,
        "z" to -0.7588,
        "{" to 0.0843,
        "|" to -0.2508,
        "}" to -0.9324,
        "~" to -0.2903
    )
}
