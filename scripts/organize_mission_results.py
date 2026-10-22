"""Create a Main review index for a completed mission campaign without relocating artifacts."""
import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import shutil


def read(path):
    return json.loads(path.read_text())


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(value, indent=2) + '\n')
    temporary.replace(path)


def organize(root, check_only=False):
    root = root.resolve()
    status = read(root / 'campaign_status.json')
    if status.get('status') != 'completed':
        raise ValueError('Wait for the campaign to complete before organizing results.')
    config = read(root / 'campaign_resolved.json')
    if config.get('campaign_kind') != 'mission-ppo-v1':
        raise ValueError('Not a mission PPO campaign.')
    final = read(root / 'final_models.json')
    scenes = {scene['name']: scene for scene in config['scenarios']}
    grouped = defaultdict(list)
    episode_dirs = set()
    modes = Counter()
    for item in final:
        fixed = Path(item['fixed']).resolve()
        operation = Path(item['operation']).resolve()
        training = Path(item['task']['train']['output_dir']).resolve()
        for path in (fixed, operation, training):
            path.relative_to(root)
        evaluation = read(fixed / 'eval_manifest.json')
        online = read(operation / 'online_manifest.json')
        if evaluation['status'] != 'completed' or online['status'] != 'completed':
            raise ValueError(f"Incomplete final comparison: {item['scene']}")
        seeds = set(config['seeds']['held_out'])
        for policy, result in evaluation['policies'].items():
            episodes = result['episodes']
            if len(episodes) != len(seeds) or {e['seed'] for e in episodes} != seeds:
                raise ValueError(f'Missing evaluation seeds: {fixed}/{policy}')
            for entry in episodes:
                directory = fixed / policy / Path(entry['episode_dir']).name
                check_episode(directory, entry['seed'], root)
                episode_dirs.add(directory)
                modes['fixed_deterministic' if policy == 'model' else policy] += 1
        for mode in ('fixed_sampled', 'online'):
            episodes = [e for e in online['episodes'] if e['mode'] == mode]
            if len(episodes) != len(seeds) or {e['seed'] for e in episodes} != seeds:
                raise ValueError(f'Missing operation seeds: {operation}/{mode}')
            for entry in episodes:
                directory = operation / mode / f"seed-{entry['seed']}" / Path(entry['episode_dir']).name
                check_episode(directory, entry['seed'], root)
                episode_dirs.add(directory)
                modes[mode] += 1
        grouped[item['scene']].append({
            **{key: item[key] for key in ('scene', 'mission', 'reward', 'profile', 'comparison', 'online_profile')},
            'fixed': fixed.relative_to(root).as_posix(),
            'operation': operation.relative_to(root).as_posix(),
            'training': training.relative_to(root).as_posix(),
        })
    if set(grouped) != set(scenes) or len(final) != 72 or any(len(rows) != 4 for rows in grouped.values()):
        raise ValueError('Expected 18 scenarios and four final models per scenario.')
    manifests = list(root.glob('models/*/*/train/*/train-seed-101/train_manifest.json'))
    for path in manifests:
        manifest = read(path)
        if manifest['status'] != 'completed' or manifest['num_timesteps'] != 60000:
            raise ValueError(f'Incomplete training: {path}')
        for prefix in ('model', 'best_model'):
            model = Path(manifest[f'{prefix}_path']).resolve()
            model.relative_to(root)
            if hashlib.sha256(model.read_bytes()).hexdigest() != manifest[f'{prefix}_sha256']:
                raise ValueError(f'Model checksum mismatch: {model}')
    if len(manifests) != 120:
        raise ValueError('Expected 120 completed training models.')
    audit = {
        'mission_results_audit_version': 1, 'status': 'verified',
        'scenarios': len(grouped), 'training_models': len(manifests),
        'checkpoint_files_verified': len(manifests) * 2,
        'final_model_comparisons': len(final), 'replay_episodes': len(episode_dirs),
        'episodes_by_mode': dict(modes), 'missing_files': 0,
        'checks': ['model SHA-256', '60000 training decisions per model',
                   'five final seeds per policy and operation', 'completed episode records',
                   'positions, links, telemetry, nodes and buildings for every final replay'],
    }
    if not check_only:
        main = root / 'main'
        for name, rows in grouped.items():
            scene = scenes[name]
            write(main / name / 'mission_scenario.json', {
                'mission_scenario_version': 1, 'scene': name,
                'mission': scene['mission'], 'peers': scene['peers'],
                'models': rows,
            })
        for name in ('mission_summary.csv', 'mission_episodes.csv', 'adaptation_pairs.csv', 'mission_report.json'):
            shutil.copyfile(root / name, main / name)
        write(main / 'results_audit.json', audit)
        (main / 'README.txt').write_text(
            'Open RL experiments > 10-16 > Main, then choose a scenario.\n'
            'Each scenario combines both rewards, standard/tuned PPO, and all three operation modes.\n'
            'Use Results for metrics, Learning for training, and Episodes / Watch in 3D for replay.\n'
            'These scenario folders index original artifacts; training and validation remain archived in their original locations.\n'
            'mission_summary.csv: final results; adaptation_pairs.csv: online minus frozen sampled.\n'
        )
    print(json.dumps(audit, indent=2))


def check_episode(directory, seed, root):
    directory.resolve().relative_to(root)
    record = read(directory / 'rl_episode.json')
    if record['status'] != 'completed' or record['decisions'] != 600:
        raise ValueError(f'Incomplete episode: {directory}')
    for tail in ('steps.jsonl', 'inputs/nodes.json', 'inputs/buildings.json',
                 f'seed-{seed}/positions.csv', f'seed-{seed}/links.csv'):
        path = directory / tail
        if not path.is_file() or path.stat().st_size == 0:
            raise ValueError(f'Missing or empty replay file: {path}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('campaign', type=Path)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    organize(args.campaign, args.check)
