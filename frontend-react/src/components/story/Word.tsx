interface Props {
  children: string;
  audio?: string;
}

export default function Word({ children, audio }: Props) {
  function play() {
    if (audio) new Audio('/api/audio/' + audio).play();
  }
  return (
    <span
      className="cursor-pointer hover:text-primary"
      onClick={play}
    >
      {children}{' '}
    </span>
  );
}
