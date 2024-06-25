// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.exc.MismatchedInputException
import com.fasterxml.jackson.module.kotlin.readValue
import com.intellij.openapi.project.Project
import com.intellij.testFramework.ProjectExtension
import com.intellij.ui.jcef.JBCefBrowserBase
import com.intellij.ui.jcef.JBCefJSQuery
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.assertj.core.api.ObjectAssert
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.RegisterExtension
import org.mockito.kotlin.mock
import software.aws.toolkits.jetbrains.core.webview.BrowserMessage
import software.aws.toolkits.jetbrains.core.webview.BrowserState
import software.aws.toolkits.jetbrains.core.webview.LoginBrowser

class NoOpLoginBrowser(project: Project, domain: String = "", url: String = "") : LoginBrowser(project, domain, url) {
    override val jcefBrowser: JBCefBrowserBase = mock()

    override fun prepareBrowser(state: BrowserState) {}

    override fun loadWebView(query: JBCefJSQuery) {}

    override fun handleBrowserMessage(message: BrowserMessage?) {}
}

class BrowserMessageTest {
    private lateinit var objectMapper: ObjectMapper

    companion object {
        @JvmField
        @RegisterExtension
        val projectExtension = ProjectExtension()
    }

    private inline fun <reified T : BrowserMessage> assertDeserializedInstanceOf(jsonStr: String): ObjectAssert<BrowserMessage> {
        val actual = objectMapper.readValue<BrowserMessage>(jsonStr)
        return assertThat(actual).isInstanceOf(T::class.java)
    }

    private inline fun <reified T : Exception> assertDeserializedWillThrow(jsonStr: String) {
        assertThatThrownBy {
            objectMapper.readValue<BrowserMessage>(jsonStr)
        }.isInstanceOf(T::class.java)
    }

    @BeforeEach
    fun setup() {
        objectMapper = NoOpLoginBrowser(projectExtension.project).objectMapper
    }

    @Test
    fun `exact match, deserialization return correct BrowserMessage subtype`() {
        assertDeserializedInstanceOf<BrowserMessage.PrepareUi>(
            """
            {
                "command": "prepareUi"
            }
            """
        )

        assertDeserializedInstanceOf<BrowserMessage.ToggleBrowser>(
            """
            {
                "command": "toggleBrowser"
            }
            """
        )

        assertDeserializedInstanceOf<BrowserMessage.SelectConnection>(
            """
            {
                "command": "selectConnection",
                "connectionId": "foo"
            }
            """
        ).isEqualTo(BrowserMessage.SelectConnection("foo"))

        assertDeserializedInstanceOf<BrowserMessage.LoginBuilderId>(
            """
            {
                "command": "loginBuilderId"
            }
            """
        )

        assertDeserializedInstanceOf<BrowserMessage.LoginIdC>(
            """
            {
                "command": "loginIdC",
                "url": "foo",
                "region": "bar",
                "feature": "baz"
            }
            """
        ).isEqualTo(
            BrowserMessage.LoginIdC(
                url = "foo",
                region = "bar",
                feature = "baz"
            )
        )

        assertDeserializedInstanceOf<BrowserMessage.LoginIAM>(
            """
            {
                "command": "loginIAM",
                "profileName": "foo",
                "accessKey": "bar",
                "secretKey": "baz"
            }
            """
        ).isEqualTo(
            BrowserMessage.LoginIAM(
                profileName = "foo",
                accessKey = "bar",
                secretKey = "baz"
            )
        )

        assertDeserializedInstanceOf<BrowserMessage.CancelLogin>(
            """
            {
                "command": "cancelLogin"
            }
            """
        )

        assertDeserializedInstanceOf<BrowserMessage.Signout>(
            """
            {
                "command": "signout"
            }
            """
        )

        assertDeserializedInstanceOf<BrowserMessage.Reauth>(
            """
            {
                "command": "reauth"
            }
            """
        )
    }

    @Test
    fun `unrecognizable command - deserialize should throw MismatchedInputException`() {
        assertDeserializedWillThrow<MismatchedInputException>(
            """
            {
                "command": ""
            }
            """
        )

        assertDeserializedWillThrow<MismatchedInputException>(
            """
            {
                "command": "zxcasdqwe"
            }
            """
        )

        assertDeserializedWillThrow<MismatchedInputException>(
            """
            {
                "command": "foo bar baz"
            }
            """
        )
    }

    @Test
    fun `unknown fields - deserialize should throw MismatchedInputException`() {
        assertDeserializedWillThrow<MismatchedInputException>(
            """
            {
                "command": "prepareUi",
                "unknown": "foo"
            }
            """
        )

        assertDeserializedWillThrow<MismatchedInputException>(
            """
            {
                "command": "loginIAM",
                "profileName": "foo",
                "unknown": "bar"
            }
            """
        )
    }

    @Test
    fun `missing required fields - deserialize fail `() {
        assertDeserializedWillThrow<MismatchedInputException>(
            """
            {
                "command": "selectConnection"
            }
            """
        )

        assertDeserializedWillThrow<MismatchedInputException>(
            """
            {
                "command": "loginIAM",
                "accessKey": "foo"
            }
            """
        )

        assertDeserializedWillThrow<MismatchedInputException>(
            """
            {
                "command": "loginIdC"
            }
            """
        )

        assertDeserializedWillThrow<MismatchedInputException>(
            """
            {
                "command": "loginIdC",
                "url": "foo"
            }
            """
        )

        assertDeserializedWillThrow<MismatchedInputException>(
            """
            {
                "command": "loginIdC",
                "region": "bar",
                "feature": "baz"
            }
            """
        )

        assertDeserializedWillThrow<MismatchedInputException>(
            """
            {
                "command": "loginIAM",
                "profileName": "bar"
            }
            """
        )

        assertDeserializedWillThrow<MismatchedInputException>(
            """
            {
                "command": "loginIAM",
                "profileName": "bar",
                "secretKey": "foo"
            }
            """
        )

        assertDeserializedWillThrow<MismatchedInputException>(
            """
            {
                "command": "loginIAM",
                "accessKey": "foo"
            }
            """
        )
    }
}
