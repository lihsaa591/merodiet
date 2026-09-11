interface ComingSoonProps {
	title: string;
	label: string;
}

export default function ComingSoon( { title, label }: ComingSoonProps ) {
	return (
		<>
			<div className="nutrio-topbar">
				<h1>{ title }</h1>
			</div>
			<p style={ { color: 'var(--ink-muted)' } }>{ label }</p>
		</>
	);
}
