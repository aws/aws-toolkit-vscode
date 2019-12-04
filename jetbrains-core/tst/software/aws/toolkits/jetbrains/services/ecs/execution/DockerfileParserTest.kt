// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecs.execution

import com.intellij.docker.dockerFile.DockerFileType
import com.intellij.docker.dockerFile.DockerLanguage
import com.intellij.docker.dockerFile.parser.DockerParserDefinition
import com.intellij.lang.LanguageParserDefinitions
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.testFramework.runInEdtAndGet
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.utils.rules.CodeInsightTestFixtureRule

class DockerfileParserTest {

    @JvmField
    @Rule
    val projectRule = CodeInsightTestFixtureRule()
    private val dockerParserDefinition = DockerParserDefinition()

    @Before
    fun setup() {
        LanguageParserDefinitions.INSTANCE.addExplicitExtension(DockerLanguage.INSTANCE, dockerParserDefinition)
    }

    @After
    fun teardown() {
        LanguageParserDefinitions.INSTANCE.removeExplicitExtension(DockerLanguage.INSTANCE, dockerParserDefinition)
    }

    @Test
    fun basicDockerfileParsing() {
        val sut = DockerfileParser(projectRule.project)
        val file = dockerfile(
            """
                FROM amazoncorretto:8
                COPY /build/libs/app.jar /home/app.jar
                EXPOSE 80
                CMD java -jar -Dserver.port=80 /home/app.jar
                """.trimIndent()
        )

        runInEdtAndWait {
            assertThat(sut.parse(file)).isEqualTo(
                DockerfileDetails(
                    "java -jar -Dserver.port=80 /home/app.jar",
                    listOf(80),
                    listOf(CopyDirective("/build/libs/app.jar", "/home/app.jar"))
                )
            )
        }
    }

    @Test
    fun understandsWorkingDirectory() {
        val sut = DockerfileParser(projectRule.project)
        val file = dockerfile(
            """
                FROM amazoncorretto:8
                WORKDIR /other
                COPY /build/libs/app.jar /home/app.jar
                COPY /build/libs/other.txt hello.txt
                WORKDIR /home
                COPY /build/libs/thing.txt thing.txt
                EXPOSE 80
                CMD java -jar -Dserver.port=80 /home/app.jar
                """.trimIndent()
        )

        runInEdtAndWait {
            assertThat(sut.parse(file)).isEqualTo(
                DockerfileDetails(
                    "java -jar -Dserver.port=80 /home/app.jar",
                    listOf(80),
                    listOf(
                        CopyDirective("/build/libs/app.jar", "/home/app.jar"),
                        CopyDirective("/build/libs/other.txt", "/other/hello.txt"),
                        CopyDirective("/build/libs/thing.txt", "/home/thing.txt")
                    )
                )
            )
        }
    }

    @Test
    fun ignoreAddCommandsAsTheyAreNotWellSupported() {
        val sut = DockerfileParser(projectRule.project)
        val file = dockerfile(
            """
                FROM amazoncorretto:8
                ADD /build/libs/thing.txt thing.txt
                """.trimIndent()
        )

        runInEdtAndWait {
            assertThat(sut.parse(file)).isEqualTo(DockerfileDetails(null, emptyList(), emptyList()))
        }
    }

    @Test
    fun incorrectlyFormattedCopyIsRecoverable() {
        val sut = DockerfileParser(projectRule.project)
        val file = dockerfile(
            """
                FROM amazoncorretto:8
                COPY
                COPY /foo
                COPY /hello /world
                """.trimIndent()
        )

        runInEdtAndWait {
            assertThat(sut.parse(file)).isEqualTo(DockerfileDetails(null, emptyList(), listOf(CopyDirective("/hello", "/world"))))
        }
    }

    @Test
    fun multiStageBuildsTakeLastFromBlockOnly() {
        val sut = DockerfileParser(projectRule.project)
        val file = dockerfile(
            """
                FROM amazoncorretto:8 as builder
                COPY . .
                CMD ./gradlew build 
                
                FROM amazoncorretto:8
                COPY /build/libs/app.jar /home/app.jar
                EXPOSE 80
                CMD java -jar -Dserver.port=80 /home/app.jar
                """.trimIndent()
        )

        runInEdtAndWait {
            assertThat(sut.parse(file)).isEqualTo(
                DockerfileDetails(
                    "java -jar -Dserver.port=80 /home/app.jar",
                    listOf(80),
                    listOf(CopyDirective("/build/libs/app.jar", "/home/app.jar"))
                )
            )
        }
    }

    @Test
    fun relativeFromDockerfile() {
        val sut = DockerfileParser(projectRule.project)
        val file = dockerfile(
            """
                FROM amazoncorretto:8
                COPY build/libs/app.jar /home/app.jar
                WORKDIR /blah
                COPY . .""".trimIndent()
        )
        val directory = file.parent.path.normalizeDirectory(matchPlatform = true)
        runInEdtAndWait {
            assertThat(sut.parse(file)).isEqualTo(
                DockerfileDetails(
                    null,
                    emptyList(),
                    listOf(CopyDirective("${directory}build/libs/app.jar", "/home/app.jar"), CopyDirective("$directory.", "/blah/."))
                )
            )
        }
    }

    private fun dockerfile(contents: String): VirtualFile =
        runInEdtAndGet {
            projectRule.fixture.configureByText(DockerFileType.DOCKER_FILE_TYPE, contents)
        }.virtualFile
}
