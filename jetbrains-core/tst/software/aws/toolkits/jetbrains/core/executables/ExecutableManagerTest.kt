// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.executables

import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.assertj.core.api.ObjectAssert
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import software.aws.toolkits.core.utils.writeText
import software.aws.toolkits.jetbrains.utils.isInstanceOf
import software.aws.toolkits.jetbrains.utils.value
import software.aws.toolkits.jetbrains.utils.wait
import java.nio.file.Path
import java.nio.file.Paths
import java.util.concurrent.atomic.AtomicInteger

class ExecutableManagerTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Rule
    @JvmField
    val tempFolder = TemporaryFolder()
    private val sut = DefaultExecutableManager()

    @Test
    fun nonExistentExecutableIsNotResolved() {
        val type = DummyExecutableType("dummy")

        sut.loadState(ExecutableStateList(listOf(ExecutableState("dummy", "/foo/bar", true))))

        assertThat(sut.getExecutable(type)).wait().isCompletedWithValueMatching { it is ExecutableInstance.UnresolvedExecutable }
    }

    @Test
    fun existingExecutableIsResolvedAndValidated() {
        val executable = tempFolder.newFile()
        val type = object : DummyExecutableType("dummy"), AutoResolvable, Validatable {
            override fun resolve(): Path = executable.toPath()

            override fun validate(path: Path) {}
        }

        assertThat(sut.getExecutable(type)).wait().isCompletedWithValueMatching { (it as ExecutableInstance.Executable).executablePath == executable.toPath() }
    }

    @Test
    fun previouslyResolvedExecutablesAreCached() {
        val executable = tempFolder.newFile()
        val count = AtomicInteger(0)
        val type = object : DummyExecutableType("dummy"), AutoResolvable {
            override fun resolve(): Path {
                count.getAndIncrement()
                return executable.toPath()
            }
        }

        sut.getExecutable(type).value
        sut.getExecutable(type).value

        assertThat(count).hasValue(1)
    }

    @Test
    fun cachedVersionExpiresIfFileBeenDeleted() {
        val count = AtomicInteger(0)
        val type = object : DummyExecutableType("dummy"), AutoResolvable {
            override fun resolve(): Path {
                count.getAndIncrement()
                return tempFolder.newFile().toPath()
            }
        }

        val file = sut.getExecutable(type).value as ExecutableInstance.Executable
        assertThat(file.executablePath.toFile().delete()).isTrue()

        assertThat(sut.getExecutable(type).value).isInstanceOf<ExecutableInstance.Executable>()

        assertThat(count).hasValue(2)
    }

    @Test
    fun resolutionExceptionsArePropagated() {
        val type = object : DummyExecutableType("dummy"), AutoResolvable {
            override fun resolve(): Path {
                throw RuntimeException("blah")
            }
        }

        assertThat(sut.getExecutable(type).value).isInstanceOfSatisfying(ExecutableInstance.UnresolvedExecutable::class.java) {
            assertThat(it.validationError).endsWith("blah")
        }
    }

    @Test
    fun notConsideredAutoResolvedIfChangedOutsideOfManager() {
        val executablePath = tempFolder.newFile().toPath()
        val type = object : DummyExecutableType("dummy"), AutoResolvable {
            override fun resolve() = executablePath
        }
        sut.getExecutable(type).value
        modifyFile(executablePath)

        assertThat(sut.getExecutable(type).value).isExecutableMatching(path = executablePath, autoResolved = false)
    }

    @Test
    fun validationExceptionsArePropagated() {

        val executable = tempFolder.newFile()

        val type = object : DummyExecutableType("dummy"), Validatable {
            override fun validate(path: Path) {
                throw RuntimeException("blah")
            }
        }

        sut.loadState(ExecutableStateList(listOf(ExecutableState(type.id, executable.absolutePath))))

        assertThat(sut.getExecutable(type).value).isInstanceOfSatisfying(ExecutableInstance.InvalidExecutable::class.java) {
            assertThat(it.executablePath).isEqualTo(executable.toPath())
            assertThat(it.validationError).endsWith("blah")
        }
    }

    @Test
    fun validationStatusIsCachedUntilFileChanges() {
        val executable = tempFolder.newFile().toPath()
        val count = AtomicInteger(0)

        val type = object : DummyExecutableType("dummy"), AutoResolvable, Validatable {
            override fun resolve(): Path = executable

            override fun validate(path: Path) {
                count.incrementAndGet()
            }
        }

        sut.getExecutable(type).value
        sut.getExecutable(type).value

        assertThat(count).hasValue(1)

        modifyFile(executable)

        sut.getExecutable(type).value
        assertThat(count).hasValue(2)
    }

    @Test
    fun canGetExecutableSynchronouslyOnlyIfPresent() {
        val type = DummyExecutableType("dummy")
        val executable = tempFolder.newFile()

        sut.setExecutablePath(type, executable.toPath()).value

        assertThat(sut.getExecutableIfPresent(type)).isInstanceOfSatisfying(ExecutableInstance.Executable::class.java) {
            assertThat(it.executablePath).isEqualTo(executable.toPath())
        }
    }

    @Test
    fun setExecutablePathFailsWhenValidateFails() {
        val type = object : DummyExecutableType("dummy"), AutoResolvable, Validatable {
            override fun resolve(): Path? = null
            override fun validate(path: Path) {
                throw RuntimeException("ow")
            }
        }
        val executable = "/fake/path////////////"

        sut.setExecutablePath(type, Paths.get(executable)).value

        // as there was not a valid path set, invalid executable is allowed to be set
        assertThat(sut.getExecutable(type).value).isInstanceOf(ExecutableInstance.InvalidExecutable::class.java)
    }

    @Test
    fun executableTypeJavaGetExecutableThrowsWhenNotRegistered() {
        val type = DummyExecutableType("dummy")
        val executable = tempFolder.newFile()

        sut.setExecutablePath(type, executable.toPath()).value

        assertThatThrownBy {
            ExecutableType.getExecutable(type.javaClass)
        }
    }

    private fun modifyFile(executable: Path) {
        Thread.sleep(1000) // Path.lastModified() is only second-level granularity
        executable.writeText("dummy")
    }

    private fun ObjectAssert<ExecutableInstance>.isExecutableMatching(version: String? = null, path: Path? = null, autoResolved: Boolean? = null) =
        isInstanceOfSatisfying(ExecutableInstance.Executable::class.java) { executable ->
            version?.let { assertThat(executable.version).isEqualTo(it) }
            path?.let { assertThat(executable.executablePath).isEqualTo(it) }
            autoResolved?.let { assertThat(executable.autoResolved).isEqualTo(autoResolved) }
        }

    private open class DummyExecutableType(final override val id: String, private val version: () -> String = { "1.4" }) : ExecutableType<String> {
        override val displayName = id

        override fun version(path: Path): String = version()
    }
}
