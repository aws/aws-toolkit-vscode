import os
import runpy
import sys

if __name__ == '__main__':
    # debugger will be available in the task root if we patched the user's requirements.txt correctly
    task_root = os.environ['LAMBDA_TASK_ROOT']
    print('Prepending Lambda task root to path: ' + task_root)
    sys.path.insert(0, task_root)
    print('Starting debugger')
    sys.stdout.flush()

    # pretend like we invoked the debugger like: python -m <debugger_name>
    runpy.run_module('ptvsd', run_name='__main__')
