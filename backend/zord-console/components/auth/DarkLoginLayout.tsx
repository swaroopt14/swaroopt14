'use client'

import { ReactNode, useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'

interface DarkLoginLayoutProps {
  children: ReactNode
  logoText?: string
  tagline?: string
  heroImages?: string[]
  backToWebsiteLink?: string
  showSignUp?: boolean
  signUpLink?: string
}

export function DarkLoginLayout({ 
  children,
  logoText = 'ZORD',
  tagline = 'Ingesting Data, Creating Evidence',
  heroImages = ['/login/login-hero.png', '/login/login-hero2.png', '/login/login-hero3.png', '/login/login-hero4.png'],
  backToWebsiteLink = '#',
  showSignUp = false,
  signUpLink = '#'
}: DarkLoginLayoutProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [isAutoPlaying, setIsAutoPlaying] = useState(true)

  // Auto-advance carousel
  useEffect(() => {
    if (!isAutoPlaying || heroImages.length <= 1) return

    const interval = setInterval(() => {
      setCurrentImageIndex((prev) => (prev + 1) % heroImages.length)
    }, 5000) // Change image every 5 seconds

    return () => clearInterval(interval)
  }, [isAutoPlaying, heroImages.length])

  const goToImage = (index: number) => {
    setCurrentImageIndex(index)
    setIsAutoPlaying(false)
    // Resume auto-play after 10 seconds
    setTimeout(() => setIsAutoPlaying(true), 10000)
  }

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % heroImages.length)
    setIsAutoPlaying(false)
    setTimeout(() => setIsAutoPlaying(true), 10000)
  }

  const prevImage = () => {
    setCurrentImageIndex((prev) => (prev - 1 + heroImages.length) % heroImages.length)
    setIsAutoPlaying(false)
    setTimeout(() => setIsAutoPlaying(true), 10000)
  }

  return (
    <div className="min-h-screen flex bg-gray-900">
      {/* Left Section - Image Carousel */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        {/* Image Carousel Container */}
        <div className="absolute inset-0 flex">
          {heroImages.map((imageSrc, index) => (
            <div
              key={index}
              className={`absolute inset-0 transition-opacity duration-1000 ${
                index === currentImageIndex ? 'opacity-100 z-10' : 'opacity-0 z-0'
              }`}
            >
              <Image
                src={imageSrc}
                alt={`Promotional image ${index + 1}`}
                fill
                className="object-cover"
                priority={index === 0}
                quality={90}
              />
              {/* Overlay gradient */}
              <div className="absolute inset-0 bg-gradient-to-b from-purple-900/20 via-blue-900/20 to-transparent"></div>
            </div>
          ))}
        </div>
        
        <div className="relative z-20 flex flex-col justify-between p-8 lg:p-12 text-white h-full w-full">
          {/* Top Left - Logo */}
          <div className="flex-shrink-0">
            <div className="text-2xl lg:text-3xl font-bold">{logoText}</div>
          </div>

          {/* Navigation Arrows */}
          {heroImages.length > 1 && (
            <div className="absolute inset-0 flex items-center justify-between pointer-events-none">
              <button
                onClick={prevImage}
                className="pointer-events-auto ml-4 p-2 bg-black/30 hover:bg-black/50 rounded-full transition-all backdrop-blur-sm"
                aria-label="Previous image"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={nextImage}
                className="pointer-events-auto mr-4 p-2 bg-black/30 hover:bg-black/50 rounded-full transition-all backdrop-blur-sm"
                aria-label="Next image"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}

          {/* Bottom Left - Tagline and Pagination */}
          <div className="flex-shrink-0">
            <p className="text-xl lg:text-2xl font-medium mb-4">{tagline}</p>
            {/* Pagination dots */}
            {heroImages.length > 1 && (
              <div className="flex space-x-2">
                {heroImages.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => goToImage(index)}
                    className={`h-1 rounded transition-all ${
                      index === currentImageIndex
                        ? 'w-8 bg-white'
                        : 'w-8 bg-white/30 hover:bg-white/50'
                    }`}
                    aria-label={`Go to image ${index + 1}`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Section - Dark Form */}
      <div className="w-full lg:w-1/2 flex flex-col bg-gray-900">
        <div className="flex-1 flex flex-col justify-center px-6 py-8 sm:px-8 lg:px-12 lg:py-12">
          {/* Top Right - Back to Website Button */}
          <div className="flex justify-end mb-8">
            <Link
              href={backToWebsiteLink}
              className="px-4 py-2 bg-gray-800 text-white text-sm font-medium rounded-lg hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-all"
            >
              Back to website →
            </Link>
          </div>

          {/* Form Content */}
          <div className="max-w-md mx-auto w-full">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
