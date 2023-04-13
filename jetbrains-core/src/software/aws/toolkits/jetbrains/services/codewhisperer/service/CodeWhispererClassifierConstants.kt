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
        "Mac OS X" to 0.102638,
        "win32" to 0.040345,
        "Windows 10" to 0.289530,
        "Windows 7" to 0.086803,
    )

    // these are used for 100% classifier driven auto trigger
    val triggerTypeCoefficientMap: Map<CodewhispererAutomatedTriggerType, Double> = mapOf(
        CodewhispererAutomatedTriggerType.SpecialCharacters to 0.017268,
        CodewhispererAutomatedTriggerType.Enter to 0.117394
    )

    val languageMap: Map<CodeWhispererProgrammingLanguage, Double> = mapOf(
        CodeWhispererPython.INSTANCE to 0.1376,
        CodeWhispererJava.INSTANCE to 0.0,
        CodeWhispererJavaScript.INSTANCE to 0.0,
        CodeWhispererCsharp.INSTANCE to 0.0,
        CodeWhispererPlainText.INSTANCE to 0.0,
        CodeWhispererTypeScript.INSTANCE to 0.0,
        CodeWhispererTsx.INSTANCE to 0.0,
        CodeWhispererJsx.INSTANCE to 0.0
    )

    // other metadata coefficient
    const val lineNumCoefficient = 0.695076

    const val cursorOffsetCoefficient = -0.438560

    // length of the current line of left_context
    const val lengthOfLeftCurrentCoefficient = -1.074552

    // length of the previous line of left context
    const val lengthOfLeftPrevCoefficient = 0.415858

    // lenght of right_context
    const val lengthofRightCoefficient = -0.500256

    const val lineDiffCoefficient = 1.227713

    const val prevDecisionAcceptCoefficient = 1.362196

    const val prevDecisionRejectCoefficient = -0.047703

    const val prevDecisionOtherCoefficient = 0.143317

    // intercept of logistic regression classifier
    const val intercept = -1.26185983

    val coefficientsMap = mapOf<String, Double>(
        "#" to -1.810876,
        "\\" to -1.954455,
        "8" to -2.052011,
        "6" to -1.868711,
        "*" to -1.489626,
        "7" to -1.643608,
        "5" to -1.633417,
        "0" to -1.457238,
        "/" to -1.395258,
        "throw" to 0.380921,
        "break" to -1.033123,
        "Z" to -0.900616,
        "]" to -1.028313,
        "1" to -1.094267,
        "continue" to -0.903924,
        "protected" to -0.749059,
        "`" to -1.264675,
        ";" to -1.101242,
        "@" to -1.294691,
        "$" to -0.452123,
        "lambda" to 0.997797,
        "9" to -1.288730,
        "~" to -0.641978,
        "}" to -0.827595,
        "4" to -1.037645,
        "2" to -1.011995,
        "elif" to 1.188137,
        "P" to -0.627397,
        "-" to -0.950035,
        "raise" to 0.983720,
        "else" to -0.479359,
        "%" to -0.329621,
        "except" to 1.064073,
        ")" to -0.718342,
        "+" to -0.736006,
        "async" to 0.597813,
        "void" to 0.147821,
        "final" to -0.845024,
        "(" to 0.184168,
        "z" to -0.850803,
        ">" to -0.504938,
        "case" to 0.362508,
        "def" to 0.715946,
        "if" to 0.417686,
        "D" to -0.816886,
        "V" to -0.647597,
        "3" to -0.583036,
        "j" to -0.653398,
        "U" to -0.622641,
        "as" to 0.093336,
        "catch" to -0.453977,
        "^" to -0.440170,
        "N" to -0.643249,
        "'" to -0.443367,
        "S" to -0.523443,
        "from" to -0.256604,
        "?" to -0.694492,
        "p" to -0.466481,
        "X" to -0.198077,
        "&" to -0.279653,
        "\"" to -0.471628,
        ":" to 0.062965,
        "private" to -0.400126,
        "I" to -0.444782,
        "." to -0.540129,
        "for" to 0.225931,
        "try" to -0.726115,
        "|" to -0.388645,
        "{" to -0.048079,
        "static" to -0.422215,
        "abstract" to -0.127709,
        "d" to -0.404917,
        "public" to -0.290176,
        "a" to -0.351206,
        "k" to -0.316385,
        "pass" to -0.422767,
        "h" to -0.326342,
        "<" to -0.451429,
        "s" to -0.428610,
        "v" to -0.415449,
        "T" to -0.441952,
        "boolean" to -0.134727,
        "None" to 0.306000,
        "c" to -0.357747,
        "nonlocal" to 0.0,
        "f" to -0.335575,
        "long" to -0.482117,
        "new" to 0.380958,
        "O" to -0.525682,
        "W" to 0.046767,
        "default" to 0.099790,
        "_" to -0.409321,
        "K" to -0.704028,
        "Y" to -0.580768,
        "=" to -0.376955,
        "B" to -0.070534,
        "R" to -0.564166,
        "or" to 0.024189,
        "n" to -0.331833,
        "char" to 0.049842,
        "await" to -0.238037,
        "byte" to 0.024610,
        "M" to -0.366598,
        "C" to -0.297840,
        "and" to 0.196992,
        "o" to -0.345940,
        "extends" to -0.079624,
        "int" to -0.451440,
        "synchronized" to 0.058414,
        "m" to -0.266107,
        "False" to -0.083505,
        "this" to -0.274180,
        "E" to -0.350734,
        "while" to -0.158144,
        "return" to 0.262580,
        "w" to -0.376440,
        "Q" to -0.511114,
        "A" to -0.333319,
        "G" to -0.367616,
        "implements" to -0.033625,
        "transient" to -0.100722,
        "b" to -0.267324,
        "l" to -0.345242,
        "H" to -0.628719,
        "," to -0.342575,
        "native" to -0.108527,
        "F" to -0.389955,
        "t" to -0.271349,
        "import" to -0.193438,
        "x" to -0.208712,
        "L" to -0.397781,
        "e" to -0.269340,
        "do" to -0.195257,
        "assert" to 0.181738,
        "instanceof" to 0.181306,
        "g" to -0.188718,
        "yield" to 0.275915,
        "with" to 0.400751,
        "throws" to 0.032822,
        "global" to -0.082052,
        "float" to 0.533561,
        "class" to 0.002792,
        "super" to -0.061203,
        "y" to -0.324526,
        "interface" to 0.135839,
        "enum" to 0.150915,
        "package" to -0.128968,
        "not" to 0.139249,
        "i" to -0.225867,
        "del" to 0.148070,
        "[" to -0.387163,
        "True" to -0.057586,
        "double" to 0.014083,
        "in" to 0.095462,
        "is" to 0.312377,
        "J" to 0.415714,
        "q" to -0.606473,
        "r" to -0.220341,
        "u" to -0.128044,
        "const" to 0.0,
        "short" to 0.0,
        "volatile" to 0.0,
        "switch" to 0.0,
        "goto" to 0.0,
        "finally" to -0.198092,
        "strictfp" to 0.0,
        "!" to -0.990260
    )
}
