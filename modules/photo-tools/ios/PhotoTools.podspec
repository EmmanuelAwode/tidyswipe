Pod::Spec.new do |s|
  s.name           = 'PhotoTools'
  s.version        = '1.0.0'
  s.summary        = 'PhotoKit helpers'
  s.description    = 'PhotoKit helpers'
  s.author         = 'local'
  s.homepage       = 'https://docs.expo.dev/'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = "**/*.{h,m,swift}"
end
