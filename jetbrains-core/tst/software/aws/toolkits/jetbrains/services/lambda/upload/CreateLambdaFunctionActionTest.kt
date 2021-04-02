// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.upload

import com.intellij.psi.PsiElement
import com.intellij.psi.SmartPointerManager
import com.intellij.psi.SmartPsiElementPointer
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.ExtensionTestUtil
import com.intellij.testFramework.TestActionEvent
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.doAnswer
import org.mockito.kotlin.mock
import software.aws.toolkits.jetbrains.services.lambda.LambdaHandlerResolver
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.openFile

class CreateLambdaFunctionActionTest {
    @Rule
    @JvmField
    val projectRule = JavaCodeInsightTestFixtureRule()

    @Rule
    @JvmField
    val disposableRule = DisposableRule()

    lateinit var smartElement: SmartPsiElementPointer<PsiElement>

    @Before
    fun setup() {
        val fixture = projectRule.fixture

        val element = fixture.addClass(
            """
public class Processor {
    public void handler() {

    }
}
        """
        ).findMethodsByName("handler", false).first()

        runInEdtAndWait {
            smartElement = SmartPointerManager.createPointer(element)
        }

        fixture.openFile(
            "template.yaml",
            """
Resources:
  ServerlessFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: foo
      Handler: helloworld.App::handleRequest
      Runtime: foo
      Timeout: 800
"""
        )
    }

    @Test
    fun InvalidNullArgs() {
        val handlerName = "helloworld.App::handleRequest"

        runInEdtAndWait {
            assertThatThrownBy { CreateLambdaFunctionAction(handlerName, null, null) }.isInstanceOf(java.lang.IllegalArgumentException::class.java)
        }
    }

    @Test
    fun InvalidNullArgs_Element() {
        val handlerName = "helloworld.App::handleRequest"
        val handlerResolver = mock<LambdaHandlerResolver> {
            on { determineHandlers(any(), any()) }.doAnswer { setOf(handlerName) }
        }

        runInEdtAndWait {
            assertThatThrownBy { CreateLambdaFunctionAction(handlerName, null, handlerResolver) }.isInstanceOf(java.lang.IllegalArgumentException::class.java)
        }
    }

    @Test
    fun InvalidNullArgs_HandlerResolver() {
        val handlerName = "helloworld.App::handleRequest"

        runInEdtAndWait {
            assertThatThrownBy { CreateLambdaFunctionAction(handlerName, smartElement, null) }.isInstanceOf(java.lang.IllegalArgumentException::class.java)
        }
    }

    @Test
    fun SamFunction() {
        val handlerName = "helloworld.App::handleRequest"
        val handlerResolver = mock<LambdaHandlerResolver> {
            on { determineHandlers(any(), any()) }.doAnswer { setOf(handlerName) }
        }

        runInEdtAndWait {
            val action = CreateLambdaFunctionAction(handlerName, smartElement, handlerResolver)

            val actionEvent = TestActionEvent()
            action.update(actionEvent)

            assertThat(actionEvent.presentation.isVisible).isFalse()
        }
    }

    @Test
    fun NonSamFunction() {
        val handlerName = "helloworld.App2::handleRequest"
        val handlerResolver = mock<LambdaHandlerResolver> {
            on { determineHandlers(any(), any()) }.doAnswer { setOf(handlerName) }
        }

        runInEdtAndWait {
            val action = CreateLambdaFunctionAction(handlerName, smartElement, handlerResolver)

            val actionEvent = TestActionEvent()
            action.update(actionEvent)

            assertThat(actionEvent.presentation.isVisible).isTrue()
        }
    }

    @Test
    fun NonSamFunction_Substring() {
        val handlerName = "helloworld.App::handleReques"
        val handlerResolver = mock<LambdaHandlerResolver> {
            on { determineHandlers(any(), any()) }.doAnswer { setOf(handlerName) }
        }

        runInEdtAndWait {
            val action = CreateLambdaFunctionAction(handlerName, smartElement, handlerResolver)

            val actionEvent = TestActionEvent()
            action.update(actionEvent)

            assertThat(actionEvent.presentation.isVisible).isTrue()
        }
    }

    @Test
    fun `Supported runtime groups shows action`() {
        // With no masking it should be visible because we have runtime groups
        runInEdtAndWait {
            val action = CreateLambdaFunctionAction()
            val actionEvent = TestActionEvent()
            action.update(actionEvent)
            assertThat(actionEvent.presentation.isVisible).isTrue()
        }
    }

    @Test
    fun `No supported runtime groups hides action`() {
        ExtensionTestUtil.maskExtensions(
            LambdaHandlerResolver.extensionPointName,
            listOf(),
            disposableRule.disposable
        )
        runInEdtAndWait {
            val action = CreateLambdaFunctionAction()
            val actionEvent = TestActionEvent()
            action.update(actionEvent)
            assertThat(actionEvent.presentation.isVisible).isFalse()
        }
    }
}
