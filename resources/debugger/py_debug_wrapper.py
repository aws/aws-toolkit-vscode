import os
import runpy
import sys
import site
import os.path

THIS_DIR = os.path.dirname(os.path.realpath(__file__))

if __name__ == '__main__':
    # argv looks like: "py_debug_wrapper.py --ikpdb-address=0.0.0.0 …"
    is_ikpdb = len(sys.argv) > 1 and ('ikpdb' in sys.argv[1])
    debugger_module = 'ikp3db' if is_ikpdb else 'ptvsd'
    # debugger will be available in the task root if we patched the user's requirements.txt correctly
    task_root = os.environ['LAMBDA_TASK_ROOT']
    print('Prepending Lambda task root to path: ' + task_root)
    sys.path.insert(0, task_root)
    print('Starting debugger')
    sys.stdout.flush()

    # site.addsitedir(os.path.join(THIS_DIR, 'lib/python3.8/site-packages'))

    # pretend like we invoked the debugger like: python -m <debugger_name>
    runpy.run_module(debugger_module, run_name='__main__', alter_sys=True)
