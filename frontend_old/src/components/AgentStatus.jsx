/**
 * AgentStatus — animated pipeline visualiser.
 * Shows the 3-agent pipeline with live step highlighting.
 */

const STEPS = [
  {
    id:    'researching',
    label: 'Researcher',
    desc:  'Analysing intent & generating queries',
    icon:  '🔍',
    match: ['pending', 'researching'],
  },
  {
    id:    'crawling',
    label: 'Crawler',
    desc:  'Fetching from YouTube, Google & web',
    icon:  '🕸️',
    match: ['crawling'],
  },
  {
    id:    'critiquing',
    label: 'Critic',
    desc:  'Ranking & summarising results',
    icon:  '🧠',
    match: ['critiquing'],
  },
];

function StepState(status, step) {
  if (status === 'completed') return 'done';
  if (step.match.includes(status)) return 'active';
  const idx = STEPS.findIndex((s) => s.id === step.id);
  const activeIdx = STEPS.findIndex((s) => s.match.includes(status));
  return idx < activeIdx ? 'done' : 'waiting';
}

export default function AgentStatus({ status }) {
  if (status === 'idle') return null;

  return (
    <div className="w-full max-w-2xl mx-auto mt-8 animate-fade-in">
      <div className="bg-gray-800/60 border border-gray-700/60 rounded-2xl p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-4">
          Agent Pipeline
        </p>

        <div className="flex items-start gap-2">
          {STEPS.map((step, i) => {
            const state = StepState(status, step);
            return (
              <div key={step.id} className="flex-1 flex flex-col items-center gap-1 text-center relative">
                {/* Connector line */}
                {i < STEPS.length - 1 && (
                  <div className={`absolute top-5 left-1/2 w-full h-0.5 z-0 transition-colors duration-500 ${
                    state === 'done' ? 'bg-green-500' : 'bg-gray-700'
                  }`} />
                )}

                {/* Icon bubble */}
                <div className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center text-lg transition-all duration-500 ${
                  state === 'active'  ? 'bg-brand-500 ring-4 ring-brand-500/30 animate-pulse-slow' :
                  state === 'done'    ? 'bg-green-500/20 ring-2 ring-green-500' :
                                        'bg-gray-700/50 ring-1 ring-gray-600'
                }`}>
                  {state === 'done' ? '✓' : step.icon}
                </div>

                <span className={`text-xs font-semibold mt-1 transition-colors ${
                  state === 'active' ? 'text-brand-400' :
                  state === 'done'   ? 'text-green-400' :
                                       'text-gray-500'
                }`}>
                  {step.label}
                </span>

                {state === 'active' && (
                  <span className="text-[10px] text-gray-400 animate-fade-in max-w-[100px]">
                    {step.desc}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {status === 'failed' && (
          <p className="mt-4 text-sm text-red-400 text-center">
            Pipeline encountered an error. Please try again.
          </p>
        )}

        {status === 'completed' && (
          <p className="mt-4 text-sm text-green-400 text-center animate-fade-in">
            All agents completed successfully
          </p>
        )}
      </div>
    </div>
  );
}
