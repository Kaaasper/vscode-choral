import choral.channels.SymChannel;

class ChoreographyDiagramSmoke@( A, B ) {
	SymChannel@( A, B )< Object > channel;

	void run( String@A message ) {
		channel.< String >com( message );
	}
}
