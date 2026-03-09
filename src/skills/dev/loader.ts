/**
 * TITAN — Dev Skills Loader
 * Internal development tools for TITAN self-improvement.
 * Only loaded when NODE_ENV !== 'production' or TITAN_DEV=true.
 * NOT published to npm — excluded from tsup entry points.
 */
import logger from '../../utils/logger.js';

const COMPONENT = 'DevSkills';

export async function initDevSkills(): Promise<void> {
    if (process.env.NODE_ENV === 'production' && !process.env.TITAN_DEV) {
        logger.debug(COMPONENT, 'Dev skills skipped (production mode)');
        return;
    }

    logger.info(COMPONENT, 'Loading dev skills...');
    let loaded = 0;

    const devSkills = [
        ['dev_code_analyze', () => import('./code_analyze.js')],
        ['dev_test_generate', () => import('./test_generate.js')],
        ['dev_deps_audit', () => import('./deps_audit.js')],
        ['dev_code_review', () => import('./code_review.js')],
        ['dev_doc_generate', () => import('./doc_generate.js')],
        ['dev_debug', () => import('./debug_analyze.js')],
        ['dev_perf', () => import('./perf_profile.js')],
        ['dev_refactor', () => import('./refactor.js')],
    ] as const;

    for (const [name, loader] of devSkills) {
        try {
            const mod = await (loader as () => Promise<{ register: () => void }>)();
            mod.register();
            loaded++;
        } catch (err) {
            logger.debug(COMPONENT, `Dev skill "${name}" not loaded: ${(err as Error).message}`);
        }
    }

    if (loaded > 0) {
        logger.info(COMPONENT, `Loaded ${loaded} dev skill(s)`);
    }
}
