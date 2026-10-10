export const SOCKET_EVENTS = {
  // Room lifecycle
  ROOM_CREATE: 'room:create',
  ROOM_CREATED: 'room:created',
  ROOM_JOIN: 'room:join',
  ROOM_JOINED: 'room:joined',
  ROOM_USER_JOINED: 'room:user_joined',
  ROOM_USER_LEFT: 'room:user_left',
  ROOM_UPDATE: 'room:update',
  ROOM_ERROR: 'room:error',

  // NTP Clock sync
  NTP_PING: 'ntp:ping',
  NTP_PONG: 'ntp:pong',
  SYNC_REPORT: 'sync:report',
  SYNC_DRIFT_ALERT: 'sync:drift_alert',

  // Audio buffering & playback
  TRACK_SELECT: 'track:select',
  TRACK_BUFFER_STATUS: 'track:buffer_status',
  TRACK_BUFFER_PROGRESS: 'track:buffer_progress',
  DSP_PROFILE_CHANGE: 'dsp:profile_change',
  PLAYBACK_SCHEDULE: 'playback:schedule',
  PLAYBACK_START: 'playback:start',
  PLAYBACK_PAUSE: 'playback:pause',
  PLAYBACK_SEEK: 'playback:seek',
  // Collaborative playlist queue & democratic governance (Phase 4)
  QUEUE_TRACK_ADD: 'queue:track_add',
  QUEUE_TRACK_REMOVE: 'queue:track_remove',
  QUEUE_NEXT: 'queue:next',
  QUEUE_VOTE_SKIP: 'queue:vote_skip',
  HOST_MIGRATED: 'host:migrated',
  CLIENT_RECONNECT: 'client:reconnect',

  CHANNEL_ASSIGN: 'channel:assign',
  CHANNEL_TEST_PING: 'channel:test_ping',
  STAGE_POSITION_UPDATE: 'stage:position_update',
  AUDIO_UNLOCK: 'audio:unlock'
};
