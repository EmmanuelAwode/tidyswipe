import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { reportError } from '../services/crash';

/** Catches a screen that throws while rendering and offers a way back instead of closing the app. */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    void reportError(error, 'screen');
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14, backgroundColor: '#F2F2F7' }}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: '#111' }}>Something went wrong</Text>
        <Text style={{ textAlign: 'center', color: '#555' }}>
          Your photos and decisions are safe. Tap below to carry on.
        </Text>
        <Text style={{ textAlign: 'center', color: '#888', fontSize: 12 }} numberOfLines={4}>
          {this.state.error.message}
        </Text>
        <Pressable
          onPress={() => this.setState({ error: null })}
          style={{ backgroundColor: '#5B5BEF', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 28 }}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}
