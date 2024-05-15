// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.util

import com.intellij.openapi.editor.markup.EffectType
import com.intellij.openapi.editor.markup.TextAttributes
import com.intellij.ui.JBColor
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.codewhispererruntime.model.CodeWhispererRuntimeException
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererJava
import software.aws.toolkits.telemetry.CodewhispererGettingStartedTask
import java.awt.Font
import java.text.SimpleDateFormat
import java.time.format.DateTimeFormatter

object CodeWhispererConstants {
    const val CHARACTERS_LIMIT = 10240
    const val BEGINNING_OF_FILE = 0
    const val FILENAME_CHARS_LIMIT = 1024
    const val INVOCATION_KEY_INTERVAL_THRESHOLD = 15
    val SPECIAL_CHARACTERS_LIST = listOf("{", "[", "(", ":")
    val PAIRED_BRACKETS = mapOf('{' to '}', '(' to ')', '[' to ']', '<' to '>')
    val PAIRED_QUOTES = setOf('"', '\'', '`')
    const val INVOCATION_TIME_INTERVAL_THRESHOLD = 2
    const val LEFT_CONTEXT_ON_CURRENT_LINE = 50
    const val POPUP_INFO_TEXT_SIZE = 11f
    const val POPUP_BUTTON_TEXT_SIZE = 12f
    const val POPUP_DELAY: Long = 250
    const val POPUP_DELAY_CHECK_INTERVAL: Long = 25
    const val IDLE_TIME_CHECK_INTERVAL: Long = 25
    const val SUPPLEMENTAL_CONTEXT_TIMEOUT = 50L
    const val FEATURE_EVALUATION_PRODUCT_NAME = "CodeWhisperer"

    val AWSTemplateKeyWordsRegex = Regex("(AWSTemplateFormatVersion|Resources|AWS::|Description)")
    val AWSTemplateCaseInsensitiveKeyWordsRegex = Regex("(cloudformation|cfn|template|description)")

    // TODO: this is currently set to 2050 to account for the server side 0.5 TPS and and extra 50 ms buffer to
    // avoid ThrottlingException as much as possible.
    const val INVOCATION_INTERVAL: Long = 2050

    const val Q_MARKETPLACE_URI = "https://aws.amazon.com/q/developer/"

    const val CODEWHISPERER_LOGIN_HELP_URI = "https://docs.aws.amazon.com/toolkit-for-jetbrains/latest/userguide/auth-access.html"
    const val Q_CUSTOM_LEARN_MORE_URI = "https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/customizations.html"
    const val Q_SUPPORTED_LANG_URI = "https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/q-language-ide-support.html"
    const val CODEWHISPERER_CODE_SCAN_LEARN_MORE_URI = "https://docs.aws.amazon.com/codewhisperer/latest/userguide/security-scans.html"
    const val CODEWHISPERER_ONBOARDING_DOCUMENTATION_URI = "https://docs.aws.amazon.com/codewhisperer/latest/userguide/features.html"
    const val Q_GITHUB_URI = "https://github.com/aws/aws-toolkit-jetbrains/issues"

    const val THROTTLING_MESSAGE = "Maximum recommendation count reached for this month."

    // Code scan feature constants
    val ISSUE_HIGHLIGHT_TEXT_ATTRIBUTES = TextAttributes(null, null, JBColor.YELLOW, EffectType.WAVE_UNDERSCORE, Font.PLAIN)
    const val CODE_SCAN_ISSUE_TITLE_MAX_LENGTH = 60
    const val DEFAULT_CODE_SCAN_TIMEOUT_IN_SECONDS: Long = 60 * 10 // 10 minutes
    const val DEFAULT_PAYLOAD_LIMIT_IN_BYTES: Long = 500 * 1024 * 1024 // 500 MB
    const val CODE_SCAN_POLLING_INTERVAL_IN_SECONDS: Long = 1
    const val FILE_SCAN_INITIAL_POLLING_INTERVAL_IN_SECONDS: Long = 10
    const val PROJECT_SCAN_INITIAL_POLLING_INTERVAL_IN_SECONDS: Long = 30
    const val CODE_SCAN_CREATE_PAYLOAD_TIMEOUT_IN_SECONDS: Long = 10
    const val FILE_SCAN_TIMEOUT_IN_SECONDS: Long = 60 // 60 seconds
    const val FILE_SCAN_PAYLOAD_SIZE_LIMIT_IN_BYTES: Long = 1024 * 200 // 200KB
    const val AUTO_SCAN_DEBOUNCE_DELAY_IN_SECONDS: Long = 5
    const val TOTAL_BYTES_IN_KB = 1024
    const val TOTAL_BYTES_IN_MB = 1024 * 1024
    const val TOTAL_MILLIS_IN_SECOND = 1000
    const val TOTAL_SECONDS_IN_MINUTE: Long = 60L
    const val ACCOUNTLESS_START_URL = "accountless"
    const val FEATURE_CONFIG_POLL_INTERVAL_IN_MS: Long = 30 * 60 * 1000L // 30 mins
    const val CODE_SCAN_ISSUE_POPUP_DELAY_IN_SECONDS: Long = 1500 // 1.5 seconds
    const val USING: String = "using"
    const val GLOBAL_USING: String = "global using"
    const val STATIC: String = "static"
    const val REQUIRE: String = "require"
    const val REQUIRE_RELATIVE: String = "require_relative"
    const val LOAD: String = "load"
    const val INCLUDE: String = "include"
    const val EXTEND: String = "extend"
    const val AS: String = " as "

    const val FILE_SCANS_LIMIT_REACHED = "You have reached the monthly quota of auto-scans."
    const val PROJECT_SCANS_LIMIT_REACHED = "You have reached the monthly quota of project scans."
    const val FILE_SCANS_THROTTLING_MESSAGE = "Maximum auto-scans count reached for this month"
    const val PROJECT_SCANS_THROTTLING_MESSAGE = "Maximum project scan count reached for this month"

    // Date when Accountless is not supported
    val EXPIRE_DATE = SimpleDateFormat("yyyy-MM-dd").parse("2023-01-31")

    // Formatter for timestamp on accountless warn notification
    val TIMESTAMP_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")

    object AutoSuggestion {
        const val SETTING_ID = "codewhisperer_autoSuggestionActivation"
        const val ACTIVATED = "Activated"
        const val DEACTIVATED = "Deactivated"
    }

    object AutoCodeScan {
        const val SETTING_ID = "codewhisperer_autoScansActivation"
        const val ACTIVATED = "Activated"
        const val DEACTIVATED = "Deactivated"
    }

    enum class CodeAnalysisScope(val value: String) {
        FILE("FILE"),
        PROJECT("PROJECT")
    }

    object Config {
        const val CODEWHISPERER_ENDPOINT = "https://codewhisperer.us-east-1.amazonaws.com/" // PROD
        const val CODEWHISPERER_IDPOOL_ID = "us-east-1:70717e99-906f-4add-908c-bd9074a2f5b9"
        val Sigv4ClientRegion = Region.US_EAST_1
        val BearerClientRegion = Region.US_EAST_1
    }

    object Customization {
        private const val noAccessToCustomizationMessage = "Your account is not authorized to use CodeWhisperer Enterprise."
        private const val invalidCustomizationMessage = "You are not authorized to access"

        val noAccessToCustomizationExceptionPredicate: (e: Exception) -> Boolean = { e ->
            if (e !is CodeWhispererRuntimeException) {
                false
            } else {
                e is AccessDeniedException && (e.message?.contains(noAccessToCustomizationMessage, ignoreCase = true) ?: false)
            }
        }

        val invalidCustomizationExceptionPredicate: (e: Exception) -> Boolean = { e ->
            if (e !is CodeWhispererRuntimeException) {
                false
            } else {
                e is AccessDeniedException && (e.message?.contains(invalidCustomizationMessage, ignoreCase = true) ?: false)
            }
        }
    }
    object CrossFile {
        const val CHUNK_SIZE = 60
    }

    object Utg {
        const val UTG_SEGMENT_SIZE = 10200
        const val UTG_PREFIX = "UTG\n"
    }

    object TryExampleFileContent {

        private const val AUTO_TRIGGER_CONTENT_JAVA =
"""import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class Main {
    public static void main(String[] args) {
        // TODO: place your cursor at the end of line 18 and press Enter to generate a suggestion.
        // Tip: press tab to accept the suggestion.

        List<Map<String, String>> fakeUsers = new ArrayList<>();
        Map<String, String> user1 = new HashMap<>();
        user1.put("name", "User 1");
        user1.put("id", "user1");
        user1.put("city", "San Francisco");
        user1.put("state", "CA");
        fakeUsers.add(user1);
        
    }
}"""

        private const val MANUAL_TRIGGER_CONTENT_JAVA =
"""// TODO: Press either Option + C on MacOS or Alt + C on Windows on a new line.

public class S3Uploader {
    
    // Function to upload a file to an S3 bucket.
    public static void uploadFile(String filePath, String bucketName) {
        
    }
}"""

        private const val UNIT_TEST_CONTENT_JAVA =
"""// TODO: Ask Amazon Q to write unit tests.

// Write a test case for the sum function.

import junit.framework.Test;

public class SumFunction {

    /**
     * Function to sum two numbers.
     *
     * @param a First number.
     * @param b Second number.
     * @return Sum of the two numbers.
     */
    public static int sum(int a, int b) {
        return a + b;
    }
    
}"""

        val tryExampleFileContexts = mapOf(
            CodewhispererGettingStartedTask.AutoTrigger to mapOf(
                CodeWhispererJava.INSTANCE to (AUTO_TRIGGER_CONTENT_JAVA to AUTO_TRIGGER_CONTENT_JAVA.length - 8)
            ),
            CodewhispererGettingStartedTask.ManualTrigger to mapOf(
                CodeWhispererJava.INSTANCE to (MANUAL_TRIGGER_CONTENT_JAVA to MANUAL_TRIGGER_CONTENT_JAVA.length - 8)
            ),
            CodewhispererGettingStartedTask.UnitTest to mapOf(
                CodeWhispererJava.INSTANCE to (UNIT_TEST_CONTENT_JAVA to UNIT_TEST_CONTENT_JAVA.length - 2)
            )
        )
    }
}
