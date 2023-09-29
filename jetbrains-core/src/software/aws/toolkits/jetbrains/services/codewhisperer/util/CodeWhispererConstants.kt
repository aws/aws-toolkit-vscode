// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.util

import com.intellij.openapi.editor.markup.EffectType
import com.intellij.openapi.editor.markup.TextAttributes
import com.intellij.ui.JBColor
import software.amazon.awssdk.regions.Region
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererCsharp
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererJava
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererJavaScript
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererPython
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererTypeScript
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

    // TODO: this is currently set to 2050 to account for the server side 0.5 TPS and and extra 50 ms buffer to
    // avoid ThrottlingException as much as possible.
    const val INVOCATION_INTERVAL: Long = 2050

    const val CODEWHISPERER_LEARN_MORE_URI = "https://aws.amazon.com/codewhisperer"
    const val CODEWHISPERER_SSO_LEARN_MORE_URI = "https://docs.aws.amazon.com/toolkit-for-jetbrains/latest/userguide/codewhisperer-auth.html"
    const val CODEWHISPERER_LOGIN_LEARN_MORE_URI = "https://docs.aws.amazon.com/toolkit-for-jetbrains/latest/userguide/codewhisper-setup-general.html"
    const val CODEWHISPERER_LOGIN_HELP_URI = "https://docs.aws.amazon.com/toolkit-for-jetbrains/latest/userguide/setup-credentials.html"
    const val CODEWHISPERER_WORKSHOP_URI =
        "https://catalog.us-east-1.prod.workshops.aws/workshops/6838a1a5-4516-4153-90ce-ac49ca8e1357/03-getting-started/03-02-prompts"
    const val CODEWHISPERER_SUPPORTED_LANG_URI = "https://docs.aws.amazon.com/codewhisperer/latest/userguide/language-ide-support.html"
    const val CODEWHISPERER_CODE_SCAN_LEARN_MORE_URI = "https://docs.aws.amazon.com/codewhisperer/latest/userguide/security-scans.html"
    const val CODEWHISPERER_ONBOARDING_DOCUMENTATION_URI = "https://docs.aws.amazon.com/codewhisperer/latest/userguide/features.html"

    const val THROTTLING_MESSAGE = "Maximum recommendation count reached for this month."

    // Code scan feature constants
    val ISSUE_HIGHLIGHT_TEXT_ATTRIBUTES = TextAttributes(null, null, JBColor.YELLOW, EffectType.WAVE_UNDERSCORE, Font.PLAIN)
    const val JAVA_CODE_SCAN_TIMEOUT_IN_SECONDS: Long = 60
    const val JAVA_PAYLOAD_LIMIT_IN_BYTES = 1024 * 1024 // 1MB
    const val PYTHON_CODE_SCAN_TIMEOUT_IN_SECONDS: Long = 60
    const val PYTHON_PAYLOAD_LIMIT_IN_BYTES = 1024 * 200 // 200KB
    const val JS_CODE_SCAN_TIMEOUT_IN_SECONDS: Long = 60
    const val JS_PAYLOAD_LIMIT_IN_BYTES = 1024 * 200 // 200KB
    const val CODE_SCAN_POLLING_INTERVAL_IN_SECONDS: Long = 5
    const val CODE_SCAN_CREATE_PAYLOAD_TIMEOUT_IN_SECONDS: Long = 10
    const val TOTAL_BYTES_IN_KB = 1024
    const val TOTAL_BYTES_IN_MB = 1024 * 1024
    const val TOTAL_MILLIS_IN_SECOND = 1000
    const val TOTAL_SECONDS_IN_MINUTE: Long = 60L
    const val ACCOUNTLESS_START_URL = "accountless"

    // Date when Accountless is not supported
    val EXPIRE_DATE = SimpleDateFormat("yyyy-MM-dd").parse("2023-01-31")

    // Formatter for timestamp on accountless warn notification
    val TIMESTAMP_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")

    object AutoSuggestion {
        const val SETTING_ID = "codewhisperer_autoSuggestionActivation"
        const val ACTIVATED = "Activated"
        const val DEACTIVATED = "Deactivated"
    }

    object Config {
        const val CODEWHISPERER_ENDPOINT = "https://codewhisperer.us-east-1.amazonaws.com/"

        const val CODEWHISPERER_IDPOOL_ID = "us-east-1:70717e99-906f-4add-908c-bd9074a2f5b9"

        val Sigv4ClientRegion = Region.US_EAST_1
        val BearerClientRegion = Region.US_EAST_1
    }

    object CrossFile {
        const val CHUNK_SIZE = 60
    }

    object Utg {
        const val UTG_SEGMENT_SIZE = 10200
        const val UTG_PREFIX = "UTG\n"
    }

    object TryExampleFileContent {

        private const val AUTO_TRIGGER_CONTENT_PYTHON =
"""# TODO: place you cursor at the end of the code and press Enter to generate a suggestion.
# tip: press tab to accept the suggestion

fake_users = [
    { "name": "User 1", "id": "user1", "city": "San Francisco", "state": "CA" },"""

        private const val AUTO_TRIGGER_CONTENT_TS_JS =
"""// TODO: place your cursor at the end of line 5 and press Enter to generate a suggestion.
// Tip: press tab to accept the suggestion.

const fake_users = [
    { "name": "User 1", "id": "user1", "city": "San Francisco", "state": "CA" },"""

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
        private const val AUTO_TRIGGER_CONTENT_CSHARP =
"""using System;
using System.Collections.Generic;

public class Program
{
    public static void Main()
    {
        // TODO: place your cursor at the end of line 20 and press Enter to generate a suggestion.
        // Tip: press tab to accept the suggestion.

        List<Dictionary<string, string>> fakeUsers = new List<Dictionary<string, string>>();

        Dictionary<string, string> user1 = new Dictionary<string, string>();
        user1.Add("name", "User 1");
        user1.Add("id", "user1");
        user1.Add("city", "San Francisco");
        user1.Add("state", "CA");

        fakeUsers.Add(user1);
        
    }
}"""

        private const val MANUAL_TRIGGER_CONTENT_PYTHON =
"""# TODO: Pressing either Option + C on MacOS or Alt + C on Windows on a new line.

# Function to upload a file to an S3 bucket
"""

        private const val MANUAL_TRIGGER_CONTENT_TS_JS =
"""// TODO: Press either Option + C on MacOS or Alt + C on Windows on a new line.
// Function to upload a file to an S3 bucket.
"""

        private const val MANUAL_TRIGGER_CONTENT_JAVA =
"""// TODO: Press either Option + C on MacOS or Alt + C on Windows on a new line.

public class S3Uploader {
    
    // Function to upload a file to an S3 bucket.
    public static void uploadFile(String filePath, String bucketName) {
        
    }
}"""

        private const val MANUAL_TRIGGER_CONTENT_CSHARP =
"""// TODO: Press either Option + C on MacOS or Alt + C on Windows on a new line.

public class S3Uploader 
{
    // Function to upload a file to an S3 bucket.
    public static void UploadFile(string filePath, string bucketName) 
    {
        
    }
}"""

        private const val COMMENT_AS_PROMPT_CONTENT_PYTHON =
"""# TODO: place your cursor at the end of line 4 and press Enter to generate a suggestion.
# Tip: press tab to accept the suggestion.

# Function to upload a file to an S3 bucket."""

        private const val COMMENT_AS_PROMPT_CONTENT_NON_PYTHON =
"""// TODO: place your cursor at the end of line 4 and press Enter to generate a suggestion.
// Tip: press tab to accept the suggestion.

// Function to upload a file to an S3 bucket."""

        private const val NAVIGATION_CONTENT_PYTHON =
"""# TODO: place your cursor at the end of line 4 and press Enter to generate a suggestion.
# CodeWhisperer generates multiple code suggestions. Use the left and right arrow keys to navigate between them.

# Function to upload a file to an AWS S3 bucket.
"""
        private const val NAVIGATION_CONTENT_NON_PYTHON =
"""// TODO: place your cursor at the end of line 4 and press Enter to generate a suggestion.
// CodeWhisperer generates multiple code suggestions. Use the left and right arrow keys to navigate between them.

// Function to upload a file to an AWS S3 bucket.
"""

        private const val UNIT_TEST_CONTENT_PYTHON =
"""# TODO: Ask CodeWhisperer to write unit tests.

def sum(a, b):
    return a + b

# Write a test case.
"""

        private const val UNIT_TEST_CONTENT_TS_JS =
"""// TODO: Ask CodeWhisperer to write unit tests.

// Function to sum two numbers.
function sum(a, b) {
    return a + b
}

// Write a test case for the sum function.
"""

        private const val UNIT_TEST_CONTENT_JAVA =
"""// TODO: Ask CodeWhisperer to write unit tests.

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

        private const val UNIT_TEST_CONTENT_CSHARP =
"""// TODO: Ask CodeWhisperer to write unit tests.

using System;

public class SumFunction 
{
    /// <summary>
    /// Sums two numbers.  
    /// </summary>
    /// <param name="a">First number.</param>
    /// <param name="b">Second number.</param>
    /// <returns>Sum of the two numbers.</returns>
    public static int Sum(int a, int b) 
    {
        return a + b;
    }

    // Write a test case for the Sum function.
    
    
}
"""

        val tryExampleFileContexts = mapOf(
            CodewhispererGettingStartedTask.AutoTrigger to mapOf(
                CodeWhispererJava.INSTANCE to (AUTO_TRIGGER_CONTENT_JAVA to AUTO_TRIGGER_CONTENT_JAVA.length - 8),
                CodeWhispererPython.INSTANCE to (AUTO_TRIGGER_CONTENT_PYTHON to AUTO_TRIGGER_CONTENT_PYTHON.length),
                CodeWhispererJavaScript.INSTANCE to (AUTO_TRIGGER_CONTENT_TS_JS to AUTO_TRIGGER_CONTENT_TS_JS.length),
                CodeWhispererTypeScript.INSTANCE to (AUTO_TRIGGER_CONTENT_TS_JS to AUTO_TRIGGER_CONTENT_TS_JS.length),
                CodeWhispererCsharp.INSTANCE to (AUTO_TRIGGER_CONTENT_CSHARP to AUTO_TRIGGER_CONTENT_CSHARP.length - 8)
            ),
            CodewhispererGettingStartedTask.ManualTrigger to mapOf(
                CodeWhispererJava.INSTANCE to (MANUAL_TRIGGER_CONTENT_JAVA to MANUAL_TRIGGER_CONTENT_JAVA.length - 8),
                CodeWhispererPython.INSTANCE to (MANUAL_TRIGGER_CONTENT_PYTHON to MANUAL_TRIGGER_CONTENT_PYTHON.length),
                CodeWhispererJavaScript.INSTANCE to (MANUAL_TRIGGER_CONTENT_TS_JS to MANUAL_TRIGGER_CONTENT_TS_JS.length),
                CodeWhispererTypeScript.INSTANCE to (MANUAL_TRIGGER_CONTENT_TS_JS to MANUAL_TRIGGER_CONTENT_TS_JS.length),
                CodeWhispererCsharp.INSTANCE to (MANUAL_TRIGGER_CONTENT_CSHARP to MANUAL_TRIGGER_CONTENT_CSHARP.length - 8)
            ),
            CodewhispererGettingStartedTask.CommentAsPrompt to mapOf(
                CodeWhispererJava.INSTANCE to (COMMENT_AS_PROMPT_CONTENT_NON_PYTHON to COMMENT_AS_PROMPT_CONTENT_NON_PYTHON.length),
                CodeWhispererPython.INSTANCE to (COMMENT_AS_PROMPT_CONTENT_PYTHON to COMMENT_AS_PROMPT_CONTENT_PYTHON.length),
                CodeWhispererJavaScript.INSTANCE to (COMMENT_AS_PROMPT_CONTENT_NON_PYTHON to COMMENT_AS_PROMPT_CONTENT_NON_PYTHON.length),
                CodeWhispererTypeScript.INSTANCE to (COMMENT_AS_PROMPT_CONTENT_NON_PYTHON to COMMENT_AS_PROMPT_CONTENT_NON_PYTHON.length),
                CodeWhispererCsharp.INSTANCE to (COMMENT_AS_PROMPT_CONTENT_NON_PYTHON to COMMENT_AS_PROMPT_CONTENT_NON_PYTHON.length)
            ),
            CodewhispererGettingStartedTask.Navigation to mapOf(
                CodeWhispererJava.INSTANCE to (NAVIGATION_CONTENT_NON_PYTHON to NAVIGATION_CONTENT_NON_PYTHON.length),
                CodeWhispererPython.INSTANCE to (NAVIGATION_CONTENT_PYTHON to NAVIGATION_CONTENT_PYTHON.length),
                CodeWhispererJavaScript.INSTANCE to (NAVIGATION_CONTENT_NON_PYTHON to NAVIGATION_CONTENT_NON_PYTHON.length),
                CodeWhispererTypeScript.INSTANCE to (NAVIGATION_CONTENT_NON_PYTHON to NAVIGATION_CONTENT_NON_PYTHON.length),
                CodeWhispererCsharp.INSTANCE to (NAVIGATION_CONTENT_NON_PYTHON to NAVIGATION_CONTENT_NON_PYTHON.length)
            ),
            CodewhispererGettingStartedTask.UnitTest to mapOf(
                CodeWhispererJava.INSTANCE to (UNIT_TEST_CONTENT_JAVA to UNIT_TEST_CONTENT_JAVA.length - 2),
                CodeWhispererPython.INSTANCE to (UNIT_TEST_CONTENT_PYTHON to UNIT_TEST_CONTENT_PYTHON.length),
                CodeWhispererJavaScript.INSTANCE to (UNIT_TEST_CONTENT_TS_JS to UNIT_TEST_CONTENT_TS_JS.length),
                CodeWhispererTypeScript.INSTANCE to (UNIT_TEST_CONTENT_TS_JS to UNIT_TEST_CONTENT_TS_JS.length),
                CodeWhispererCsharp.INSTANCE to (UNIT_TEST_CONTENT_CSHARP to UNIT_TEST_CONTENT_CSHARP.length - 8)
            )
        )
    }
}
