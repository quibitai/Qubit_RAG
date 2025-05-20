import type { OAuthConfig, OAuthUserConfig } from 'next-auth/providers';
import { logger } from '@/lib/logger';

export interface AsanaProfile {
  data: {
    gid: string;
    name: string;
    email: string;
    photo?: {
      image_128x128: string;
    };
  };
}

export default function Asana<P extends AsanaProfile>(
  options: OAuthUserConfig<P>,
): OAuthConfig<P> {
  logger.debug('AsanaProvider', 'Initializing Asana OAuth provider', {
    clientIdProvided: !!options.clientId,
    clientSecretProvided: !!options.clientSecret,
    customAuthUrl: !!options.authorization?.url,
    customTokenUrl: !!options.token,
  });

  return {
    id: 'asana',
    name: 'Asana',
    type: 'oauth',
    wellKnown: undefined,
    authorization: {
      url:
        options.authorization?.url ?? 'https://app.asana.com/-/oauth_authorize',
      params: {
        scope: options.authorization?.params?.scope ?? 'default',
        response_type: 'code',
        access_type: options.authorization?.params?.access_type ?? 'offline',
      },
    },
    token: options.token ?? 'https://app.asana.com/-/oauth_token',
    userinfo: {
      url: 'https://app.asana.com/api/1.0/users/me',
      async request({ tokens }: { tokens: { access_token: string } }) {
        logger.debug('AsanaProvider', 'Fetching user info with token', {
          tokenPresent: !!tokens.access_token,
          tokenLength: tokens.access_token?.length || 0,
        });

        const response = await fetch('https://app.asana.com/api/1.0/users/me', {
          headers: {
            Authorization: `Bearer ${tokens.access_token}`,
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          logger.error('AsanaProvider', 'Failed to fetch user info', {
            status: response.status,
            error: errorText,
          });
          throw new Error(
            `Failed to fetch user info from Asana: ${response.status} ${errorText}`,
          );
        }

        const data = await response.json();
        logger.debug('AsanaProvider', 'User info received', {
          profileData: JSON.stringify(data),
        });
        return data;
      },
    },
    profile(profile) {
      logger.debug('AsanaProvider', 'Processing profile data', {
        profileId: profile.data?.gid,
        profileName: profile.data?.name,
        hasEmail: !!profile.data?.email,
        hasPhoto: !!profile.data?.photo,
      });

      return {
        id: profile.data.gid,
        name: profile.data.name,
        email: profile.data.email,
        image: profile.data.photo?.image_128x128,
      };
    },
    options,
  };
}
