// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import com.adarshr.gradle.testlogger.TestLoggerExtension
import com.adarshr.gradle.testlogger.TestLoggerPlugin
import org.jetbrains.intellij.tasks.DownloadRobotServerPluginTask
import org.jetbrains.intellij.tasks.RunIdeForUiTestTask
import org.jetbrains.intellij.tasks.RunIdeTask
import org.jetbrains.kotlin.gradle.tasks.KotlinCompile
import software.aws.toolkits.gradle.IdeVersions
import software.aws.toolkits.gradle.changelog.tasks.GenerateGithubChangeLog
import software.aws.toolkits.gradle.ciOnly
import software.aws.toolkits.gradle.findFolders
import software.aws.toolkits.gradle.getOrCreate
import software.aws.toolkits.gradle.intellij
import java.time.Instant

buildscript {
    val kotlinVersion: String by project
    val ideaPluginVersion: String by project
    dependencies {
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:$kotlinVersion")
        classpath("org.jetbrains.intellij.plugins:gradle-intellij-plugin:$ideaPluginVersion")
        classpath("com.adarshr:gradle-test-logger-plugin:2.1.1")
    }
}

val ideProfile = IdeVersions.ideProfile(project)
val toolkitVersion: String by project
val kotlinVersion: String by project
val mockitoVersion: String by project
val mockitoKotlinVersion: String by project
val assertjVersion: String by project
val junitVersion: String by project
val remoteRobotPort: String by project
val ktlintVersion: String by project
val remoteRobotVersion: String by project

plugins {
    java
    jacoco
    id("de.undercouch.download") apply false
    id("org.gradle.test-retry") version "1.2.0"
}

group = "software.aws.toolkits"
// please check changelog generation logic if this format is changed
version = "$toolkitVersion-${ideProfile.shortName}"

allprojects {
    repositories {
        mavenLocal()
        System.getenv("CODEARTIFACT_URL")?.let {
            println("Using CodeArtifact proxy: $it")
            maven {
                url = uri(it)
                credentials {
                    username = "aws"
                    password = System.getenv("CODEARTIFACT_AUTH_TOKEN")
                }
            }
        }
        gradlePluginPortal()
        mavenCentral()
    }
}

subprojects {
    apply(plugin = "com.adarshr.test-logger")
    apply(plugin = "java")
    apply(plugin = "jacoco")
    apply(plugin = "org.gradle.test-retry")

    java.sourceCompatibility = JavaVersion.VERSION_1_8
    java.targetCompatibility = JavaVersion.VERSION_1_8

    tasks.withType(JavaExec::class.java) {
        systemProperty("aws.toolkits.enableTelemetry", false)
    }

    tasks.withType(RunIdeTask::class.java) {
        val alternativeIde = System.getenv("ALTERNATIVE_IDE")
        if (alternativeIde != null) {
            // remove the trailing slash if there is one or else it will not work
            val path = alternativeIde.trimEnd('/')
            if (File(path).exists()) {
                intellij {
                    alternativeIdePath = path
                }
            } else {
                throw GradleException("ALTERNATIVE_IDE path not found $alternativeIde")
            }
        }
    }

    configurations {
        runtimeClasspath {
            exclude(group = "org.slf4j")
            exclude(group = "org.jetbrains.kotlin")
            exclude(group = "org.jetbrains.kotlinx")
            exclude(group = "software.amazon.awssdk", module = "netty-nio-client")
        }
    }
}

// Kotlin plugin seems to be bugging out when there are no kotlin sources
configure(subprojects.filter { it.name != "sdk-codegen" }) {
    apply(plugin = "kotlin")

    sourceSets {
        getOrCreate("integrationTest") {
            java.srcDir("it")
        }
    }
}

subprojects {
    parent?.let {
        group = it.group
        version = it.version
    } ?: throw IllegalStateException("Subproject $name parent is null!")

    apply(plugin = "java")
    apply(plugin = "idea")
    apply(plugin = "com.adarshr.test-logger")

    sourceSets {
        main {
            java.srcDirs(findFolders(project, "src", ideProfile))
            resources.srcDirs(findFolders(project, "resources", ideProfile))
        }
        test {
            java.srcDirs(findFolders(project, "tst", ideProfile))
            resources.srcDirs(findFolders(project, "tst-resources", ideProfile))
        }
        getOrCreate("integrationTest") {
            compileClasspath += main.get().output + test.get().output
            runtimeClasspath += main.get().output + test.get().output
            java.srcDirs(findFolders(project, "it", ideProfile))
            resources.srcDirs(findFolders(project, "it-resources", ideProfile))
        }
    }

    val testArtifacts by configurations.creating
    configurations.getByName("integrationTestImplementation").apply {
        extendsFrom(configurations.getByName("testImplementation"))
    }
    configurations.getByName("integrationTestRuntimeOnly").apply {
        extendsFrom(configurations.getByName("testRuntimeOnly"))
    }

    dependencies {
        compileOnly("org.jetbrains.kotlin:kotlin-stdlib-jdk8:$kotlinVersion")
        compileOnly("org.jetbrains.kotlin:kotlin-reflect:$kotlinVersion")
        testImplementation("com.nhaarman.mockitokotlin2:mockito-kotlin:$mockitoKotlinVersion")
        testImplementation("org.mockito:mockito-core:$mockitoVersion")
        testImplementation("org.assertj:assertj-core:$assertjVersion")
        testImplementation("junit:junit:$junitVersion")
    }

    plugins.withType<TestLoggerPlugin> {
        configure<TestLoggerExtension> {
            showFullStackTraces = true
            showStandardStreams = true
            showPassedStandardStreams = false
            showSkippedStandardStreams = true
            showFailedStandardStreams = true
        }
    }

    tasks.test {
        configure<JacocoTaskExtension> {
            // don't instrument sdk, icons, ktlint, etc.
            includes = listOf("software.aws.toolkits.*")
            excludes = listOf("software.aws.toolkits.ktlint.*")
        }

        reports {
            junitXml.isEnabled = true
            html.isEnabled = true
        }

        ciOnly {
            retry {
                failOnPassedAfterRetry.set(false)
                maxFailures.set(5)
                maxRetries.set(2)
            }
        }
    }

    plugins.withType<IdeaPlugin> {
        model.module.apply {
            sourceDirs.plusAssign(sourceSets.main.get().java.srcDirs)
            resourceDirs.plusAssign(sourceSets.main.get().resources.srcDirs)
            testSourceDirs.plusAssign(File("tst-${ideProfile.shortName}"))
            testResourceDirs.plusAssign(File("tst-resources-${ideProfile.shortName}"))

            sourceDirs.minusAssign(File("it"))
            testSourceDirs.plusAssign(File("it"))
            testSourceDirs.plusAssign(File("it-${ideProfile.shortName}"))

            resourceDirs.minusAssign(File("it-resources"))
            testResourceDirs.plusAssign(File("it-resources"))
            testResourceDirs.plusAssign(File("it-resources-${ideProfile.shortName}"))
        }
    }

    tasks.register<Test>("integrationTest") {
        group = LifecycleBasePlugin.VERIFICATION_GROUP
        description = "Runs the integration tests."
        testClassesDirs = sourceSets["integrationTest"].output.classesDirs
        classpath = sourceSets["integrationTest"].runtimeClasspath

        configure<JacocoTaskExtension> {
            // don"t instrument sdk, icons, ktlint, etc.
            includes = listOf("software.aws.toolkits.*")
            excludes = listOf("software.aws.toolkits.ktlint.*")
        }

        project.plugins.withId("org.jetbrains.intellij") {
            systemProperty("log.dir", "${(project.extensions["intellij"] as org.jetbrains.intellij.IntelliJPluginExtension).sandboxDirectory}-test/logs")
        }

        systemProperty("testDataPath", project.rootDir.toPath().resolve("testdata").toString())

        mustRunAfter(tasks.test)

        ciOnly {
            retry {
                failOnPassedAfterRetry.set(false)
                maxFailures.set(5)
                maxRetries.set(2)
            }
        }
    }

    project.plugins.withId("org.jetbrains.intellij") {
        extensions.getByType<JacocoPluginExtension>().applyTo(tasks.getByName<RunIdeForUiTestTask>("runIdeForUiTests"))

        tasks.withType(DownloadRobotServerPluginTask::class.java) {
            this.version = remoteRobotVersion
        }

        tasks.withType(RunIdeForUiTestTask::class.java).all {
            systemProperty("robot-server.port", remoteRobotPort)
            systemProperty("ide.mac.file.chooser.native", "false")
            systemProperty("jb.consents.confirmation.enabled", "false")
            // This does some magic in EndUserAgreement.java to make it not show the privacy policy
            systemProperty("jb.privacy.policy.text", "<!--999.999-->")
            // This only works on 2020.3+ FIX_WHEN_MIN_IS_203 remove this explanation
            systemProperty("ide.show.tips.on.startup.default.value", false)

            systemProperty("aws.telemetry.skip_prompt", "true")
            systemProperty("aws.suppress_deprecation_prompt", true)
            ciOnly {
                systemProperty("aws.sharedCredentialsFile", "/tmp/.aws/credentials")
            }

            debugOptions {
                enabled.set(true)
                suspend.set(false)
            }

            configure<JacocoTaskExtension> {
                setDestinationFile(File("$buildDir/jacoco/${Instant.now()}-jacocoUiTests.exec"))
            }
        }
    }

    tasks.withType<KotlinCompile>().all {
        kotlinOptions.jvmTarget = "1.8"
        kotlinOptions.apiVersion = "1.3"
    }

    // Force us to compile the integration tests even during check even though we don't run them
    tasks.named("check") {
        dependsOn.add(sourceSets.getByName("integrationTest").compileJavaTaskName)
    }

    val testJar = tasks.register<Jar>("testJar") {
        archiveBaseName.set("${project.name}-test")
        from(sourceSets.test.get().output)
        from(sourceSets.getByName("integrationTest").output)
    }

    artifacts {
        add("testArtifacts", testJar)
    }
}

apply(plugin = "toolkit-change-log")

tasks.register<GenerateGithubChangeLog>("generateChangeLog") {
    changeLogFile.set(project.file("CHANGELOG.md"))
}

val ktlint: Configuration by configurations.creating
val ktlintTask = tasks.register<JavaExec>("ktlint") {
    description = "Check Kotlin code style."
    classpath = ktlint
    group = "verification"
    main = "com.pinterest.ktlint.Main"

    val isWindows = System.getProperty("os.name")?.toLowerCase()?.contains("windows") == true

    // Must be relative or else Windows will fail
    var toInclude = project.projectDir.toRelativeString(project.rootDir) + "/**/*.kt"
    var toExclude = File(project.projectDir, "jetbrains-rider").toRelativeString(project.rootDir) + "/**/*.Generated.kt"

    if (isWindows) {
        toInclude = toInclude.replace("/", "\\")
        toExclude = toExclude.replace("/", "\\")
    }

    args = listOf("-v", toInclude, "!${toExclude}", "!/**/generated-src/**/*.kt")

    inputs.files(fileTree(".") { include("**/*.kt") })
    outputs.dirs("${project.buildDir}/reports/ktlint/")
}

val coverageReport = tasks.register<JacocoReport>("coverageReport") {
    executionData.setFrom(fileTree(project.rootDir.absolutePath) { include("**/build/jacoco/*.exec") })

    subprojects.forEach {
        additionalSourceDirs.from(it.sourceSets.main.get().java.srcDirs)
        sourceDirectories.from(it.sourceSets.main.get().java.srcDirs)
        classDirectories.from(it.sourceSets.main.get().output.classesDirs)
    }

    reports {
        html.isEnabled = true
        xml.isEnabled = true
    }
}

subprojects.forEach {
    coverageReport.get().mustRunAfter(it.tasks.withType(Test::class.java))
}

tasks.named("check") {
    dependsOn(ktlintTask)
    dependsOn(coverageReport)
}

dependencies {
    ktlint("com.pinterest:ktlint:$ktlintVersion")
    ktlint(project(":ktlint-rules"))
}

tasks.register("runIde") {
    doFirst {
        throw GradleException("Use project specific runIde command, i.e. :jetbrains-core:runIde, :intellij:runIde")
    }
}
