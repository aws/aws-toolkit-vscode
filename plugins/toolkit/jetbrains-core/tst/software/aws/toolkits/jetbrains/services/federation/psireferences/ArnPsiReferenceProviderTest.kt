// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.federation.psireferences

import com.intellij.ide.highlighter.JavaFileType
import com.intellij.lang.java.JavaLanguage
import com.intellij.openapi.application.runReadAction
import com.intellij.patterns.PlatformPatterns
import com.intellij.psi.impl.source.resolve.reference.CommentsReferenceContributor
import com.intellij.psi.impl.source.resolve.reference.ReferenceProvidersRegistry
import com.intellij.psi.javadoc.PsiDocToken
import com.intellij.psi.search.PsiElementProcessor
import com.intellij.psi.util.PsiTreeUtil
import com.intellij.psi.util.PsiUtilCore
import com.intellij.testFramework.runInEdtAndGet
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.utils.rules.CodeInsightTestFixtureRule

class ArnPsiReferenceProviderTest {
    @Rule
    @JvmField
    val projectRule = CodeInsightTestFixtureRule()

    @Test
    fun `matches valid arns`() {
        val valid = listOf(
            "arn:aws:lambda::123456789012:function:adsfadfsa",
            "arn:aws:lambda:us-west-2:123456789012:function:adsfadfsa",
            "arn:aws:s3:::bucket_name",
            "arn:aws-cn:s3:::bucket_name",
            "arn:aws-us-gov:s3:::bucket_name"
        )

        valid.forEach {
            assertThat(ArnPsiReferenceProvider.ARN_REGEX.findAll(it).toList())
                .withFailMessage { "Input should have matched regex with single result, but did not: $it" }
                .hasSize(1)
        }
    }

    @Test
    fun `doesn't match invalid arns`() {
        val invalid = listOf(
            "arn:asdfadsfadfsfdsafdas",
            "arn:::::function:adsfadfsa"
        )

        invalid.forEach {
            assertThat(ArnPsiReferenceProvider.ARN_REGEX.findAll(it).toList()).withFailMessage { "Input should not have matched regex, but did: $it" }
                .isEmpty()
        }
    }

    @Test
    fun `matches subset if arn is partially valid`() {
        val pairs = listOf(
            "arn:arn:aws:lambda::123456789012:function:ad\"sfadfsa" to "arn:aws:lambda::123456789012:function:ad",
            "arn:arn:aws:lambda::123456789012:function:ad   adsfa\"sfadfsa" to "arn:aws:lambda::123456789012:function:ad",
            "arn:aws:iam::123456789012:user/Development/product_1234/*" to "arn:aws:iam::123456789012:user/Development/product_1234/*",
            "arn:aws:s3:::my_corporate_bucket/Development/*" to "arn:aws:s3:::my_corporate_bucket/Development/*",
            "arn:aws:s3:::my_corporate_bucket/Development/dasfa " to "arn:aws:s3:::my_corporate_bucket/Development/dasfa"
        )

        pairs.forEach { pair ->
            val (str, match) = pair
            assertThat(ArnPsiReferenceProvider.ARN_REGEX.findAll(str).toList())
                .withFailMessage { "Input should have partially matched regex with single result but did not: $str" }
                .satisfies {
                    assertThat(it).hasSize(1)
                    assertThat(it.first().value).isEqualTo(match)
                }
        }
    }

    @Test
    fun `attaches annotation to ARN-like PsiElements`() {
        // language=TEXT
        val expected = "arn:aws:lambda::123456789012:function"
        // language=Java
        val contents = """
            class TestClass {
                // an amazing comment with arn: $expected
                /*
                * a C-style $expected comment
                */
                String single = "$expected";
                /**
                * a very good javadoc with $expected and things
                */
                String partialMatch = "\"$expected\"";
            }
        """.trimIndent()

        // we don't have access to [JavaReferenceContributor] in our sandbox (it comes from the Java Internationalization plugin),
        // so register the PsiDocToken contributor manually to be able to test JavaDoc ARN resolution
        ReferenceProvidersRegistry.getInstance().getRegistrar(JavaLanguage.INSTANCE).registerReferenceProvider(
            PlatformPatterns.psiElement(
                PsiDocToken::class.java
            ),
            CommentsReferenceContributor.COMMENTS_REFERENCE_PROVIDER_TYPE.provider
        )

        val file = runInEdtAndGet {
            projectRule.fixture.configureByText(JavaFileType.INSTANCE, contents)
        }.virtualFile

        val elements = mutableListOf<ArnReference>()
        runReadAction {
            PsiTreeUtil.processElements(
                PsiUtilCore.findFileSystemItem(projectRule.project, file),
                PsiElementProcessor { child ->
                    elements.addAll(child.references.filterIsInstance<ArnReference>())

                    return@PsiElementProcessor true
                }
            )

            assertThat(elements).hasSize(5).allSatisfy {
                assertThat(it.value)
                    .withFailMessage { "Expected ArnReference with value of '$expected' from PsiElement: $it" }
                    .isEqualTo(expected)
            }
        }
    }

    @Test
    fun `attaches single reference when multiple PSI elements are applicable`() {
        // we assume that ElementManipulators do the correct thing for us
        // language=YAML
        val contents = """
            Hello:
              Some:
                Nesting: 1 # arn:aws:lambda::123456789012:function
        """.trimIndent()

        val file = runInEdtAndGet {
            projectRule.fixture.configureByText("yaml.yaml", contents)
        }.virtualFile

        val elements = mutableListOf<ArnReference>()
        runReadAction {
            PsiTreeUtil.processElements(
                PsiUtilCore.findFileSystemItem(projectRule.project, file),
                PsiElementProcessor { child ->
                    elements.addAll(child.references.filterIsInstance<ArnReference>())

                    return@PsiElementProcessor true
                }
            )

            assertThat(elements).hasSize(1).allSatisfy {
                assertThat(it).isInstanceOf(ArnReference::class.java)
            }
        }
    }

    @Test
    fun `attaches reference to JSON values`() {
        // language=JSON
        val contents = """
            {
              "hello": "arn:aws:lambda::123456789012:function"
            }
        """.trimIndent()

        val file = runInEdtAndGet {
            projectRule.fixture.configureByText("json.json", contents)
        }.virtualFile

        val elements = mutableListOf<ArnReference>()
        runReadAction {
            PsiTreeUtil.processElements(
                PsiUtilCore.findFileSystemItem(projectRule.project, file),
                PsiElementProcessor { child ->
                    elements.addAll(child.references.filterIsInstance<ArnReference>())

                    return@PsiElementProcessor true
                }
            )

            assertThat(elements).hasSize(1).allSatisfy {
                assertThat(it).isInstanceOf(ArnReference::class.java)
            }
        }
    }
}
