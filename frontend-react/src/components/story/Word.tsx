interface Props {
  children: string;
  audio?: string;
  wrong?: boolean;
}

export default function Word({ children, audio, wrong }: Props) {
  function play() {
    if (audio) new Audio('/api/audio/' + audio).play();
  }
  return (
    <span
      className={
        'cursor-pointer hover:text-primary' + (wrong ? ' wrong shake' : '')
      }
      onClick={play}
    >
      {children}{' '}
    </span>
  );
}
